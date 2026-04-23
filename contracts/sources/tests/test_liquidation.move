#[test_only]
module weavelink::test_liquidation {

    use weavelink::market;
    use weavelink::mock_tokens;
    use weavelink::price_oracle;

    // Token IDs
    const USDC: u8 = 0;
    const S_INIT: u8 = 1;

    // === Setup ===

    fun setup(deployer: &signer) {
        market::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);
        market::create_market(deployer, USDC, S_INIT, 80, 1000000, 1000000, 80, 2000000);
    }

    fun fund_user(deployer: &signer, user: address, usdc_amount: u64, sinit_amount: u64) {
        mock_tokens::mint(deployer, user, USDC, usdc_amount);
        mock_tokens::mint(deployer, user, S_INIT, sinit_amount);
    }

    // === Liquidation Tests ===

    // Partial liquidation: repay less than full debt
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    fun test_partial_liquidation(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Borrower: supply 500 USDC liquidity, 200 collateral, borrow 80
        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 80);

        // Drop collateral price to make unhealthy
        // max_borrow = 200 * 500000 * 80 / 100 = 80000000
        // borrowed_value = 80 * 1000000 = 80000000 => borderline
        // Drop more to be clearly unhealthy
        price_oracle::set_price(deployer, S_INIT, 400000);
        // max_borrow = 200 * 400000 * 80 / 100 = 64000000 < 80000000

        // Liquidate only 40 of the 80 debt
        market::liquidate(liquidator, @0x1111, 1, 40);

        // Borrower: borrowed = 80 - 40 = 40, collateral = 200 - 40 = 160
        let (_, borrowed, collateral) = market::get_position(@0x1111, 1);
        assert!(borrowed == 40, 100);
        assert!(collateral == 160, 101);

        // Market totals updated
        let (_, _, total_supply, total_borrow, total_collateral, _, _) = market::get_market(1);
        assert!(total_borrow == 40, 102);
        assert!(total_collateral == 160, 103);

        // Liquidator: paid 40 USDC, received 40 S_INIT
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 10000 - 40, 104);
        assert!(mock_tokens::balance_of(@0x2222, S_INIT) == 10000 + 40, 105);
    }

    // Full liquidation: repay entire debt
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    fun test_full_liquidation(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 80);

        // Make unhealthy
        price_oracle::set_price(deployer, S_INIT, 400000);

        // Liquidate with max_repay > borrowed (should cap at 80)
        market::liquidate(liquidator, @0x1111, 1, 200);

        let (_, borrowed, collateral) = market::get_position(@0x1111, 1);
        assert!(borrowed == 0, 100);
        assert!(collateral == 120, 101); // 200 - 80 seized
    }

    // Cannot liquidate a healthy position
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    #[expected_failure(abort_code = market::EHEALTH_FACTOR_BELOW_ONE)]
    fun test_cannot_liquidate_healthy_position(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 40); // Well within LTV

        // Position is healthy, liquidation should fail
        // The assert!(!check_health_factor(...)) requires unhealthy, so healthy => abort
        market::liquidate(liquidator, @0x1111, 1, 40);
    }

    // Cannot liquidate with 0 repay
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    #[expected_failure(abort_code = market::EINVALID_AMOUNT)]
    fun test_cannot_liquidate_zero_repay(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 80);
        price_oracle::set_price(deployer, S_INIT, 400000);

        market::liquidate(liquidator, @0x1111, 1, 0);
    }

    // Cannot liquidate nonexistent position
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    #[expected_failure(abort_code = market::EPOSITION_NOT_FOUND)]
    fun test_cannot_liquidate_nonexistent_position(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x2222, 10000, 10000);

        // @0x1111 has no position
        market::liquidate(liquidator, @0x1111, 1, 100);
    }

    // Cannot liquidate on nonexistent market
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    #[expected_failure(abort_code = market::EMARKET_NOT_FOUND)]
    fun test_cannot_liquidate_nonexistent_market(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        // Market 999 doesn't exist
        market::liquidate(liquidator, @0x1111, 999, 100);
    }

    // Liquidator must have sufficient balance to repay
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    #[expected_failure(abort_code = market::EINSUFFICIENT_COLLATERAL)]
    fun test_liquidator_insufficient_balance(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        // Liquidator has no USDC
        fund_user(deployer, @0x2222, 0, 10000);

        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 80);
        price_oracle::set_price(deployer, S_INIT, 400000);

        // Liquidator has 0 USDC, can't repay
        market::liquidate(liquidator, @0x1111, 1, 80);
    }

    // Multiple liquidations in sequence (partial then remaining)
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    fun test_sequential_liquidations(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Collateral=100, borrow=80 => need price drop to be unhealthy
        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 100);
        market::borrow(borrower, @0x1111, 1, 80);

        // Drop price: max_borrow = 100*300000*80/100 = 24M < borrowed_value = 80M
        price_oracle::set_price(deployer, S_INIT, 300000);

        // First partial liquidation: repay 30
        // After: borrowed=50, collateral=70, max_borrow=70*300000*80/100=16.8M < 50M => still unhealthy
        market::liquidate(liquidator, @0x1111, 1, 30);
        let (_, borrowed1, collateral1) = market::get_position(@0x1111, 1);
        assert!(borrowed1 == 50, 100);   // 80 - 30
        assert!(collateral1 == 70, 101); // 100 - 30

        // Second liquidation: repay remaining 50
        market::liquidate(liquidator, @0x1111, 1, 50);
        let (_, borrowed2, collateral2) = market::get_position(@0x1111, 1);
        assert!(borrowed2 == 0, 102);    // 50 - 50
        assert!(collateral2 == 20, 103); // 70 - 50

        // Liquidator totals: paid 30+50=80 USDC, received 30+50=80 S_INIT
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 10000 - 80, 104);
        assert!(mock_tokens::balance_of(@0x2222, S_INIT) == 10000 + 80, 105);
    }

    // Liquidation when collateral price drops significantly (collateral < debt)
    #[test(deployer = @weavelink, borrower = @0x1111, liquidator = @0x2222)]
    fun test_liquidation_collateral_less_than_debt(deployer: &signer, borrower: &signer, liquidator: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Borrower: supply 500 liquidity, 50 collateral, borrow 40
        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 50);
        market::borrow(borrower, @0x1111, 1, 40);

        // Drop price severely so collateral value < debt
        price_oracle::set_price(deployer, S_INIT, 100000); // $0.1
        // max_borrow = 50 * 100000 * 80 / 100 = 4000000
        // borrowed_value = 40 * 1000000 = 40000000
        // Clearly unhealthy

        // max_repay = 40, but collateral = 50, seized = min(50, 40) = 40
        market::liquidate(liquidator, @0x1111, 1, 40);

        let (_, borrowed, collateral) = market::get_position(@0x1111, 1);
        assert!(borrowed == 0, 100);
        assert!(collateral == 10, 101); // 50 - 40
    }

    // Health factor is 0 after price crash (verify before liquidation)
    #[test(deployer = @weavelink, borrower = @0x1111)]
    fun test_health_factor_after_price_crash(deployer: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);

        market::supply(borrower, @0x1111, 1, 500);
        market::supply_collateral(borrower, @0x1111, 1, 200);
        market::borrow(borrower, @0x1111, 1, 80);

        // Before price drop: hf = (200 * 1e6 * 80/100) / (80 * 1e6) * 100 = 200
        let hf_before = market::get_health_factor(@0x1111, 1);
        assert!(hf_before == 200, 100);

        // After price crash
        price_oracle::set_price(deployer, S_INIT, 400000);
        // hf = (200 * 400000 * 80/100) / (80 * 1000000) * 100
        //    = 64000000 / 80000000 * 100 = 80
        let hf_after = market::get_health_factor(@0x1111, 1);
        assert!(hf_after == 80, 101);
    }
}