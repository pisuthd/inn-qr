#[test_only]
module weavelink::test_market {

    use weavelink::market_v1;
    use weavelink::mock_tokens;
    use weavelink::price_oracle;

    // Token IDs
    const USDC: u8 = 0;
    const S_INIT: u8 = 1;

    // === Helper: Full setup ===

    // Setup: init modules, create market, fund users
    fun setup_all(
        deployer: &signer,
        user_1: &signer,
        user_2: &signer
    ) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer); 

        // Create market: loan=USDC(0), collateral=S_INIT(1), lltv=80%
        market_v1::create_market(deployer, USDC, S_INIT, 80, 1000000, 1000000, 80, 2000000);

        // Fund users with tokens
        mock_tokens::mint(deployer, @0x1111, USDC, 10000);
        mock_tokens::mint(deployer, @0x1111, S_INIT, 10000);
        mock_tokens::mint(deployer, @0x2222, USDC, 10000);
        mock_tokens::mint(deployer, @0x2222, S_INIT, 10000);
    }

    // === Market Creation Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EUNAUTHORIZED)]
    fun test_create_market_unauthorized(deployer: &signer, user_1: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        // user_1 is not the owner, should fail
        market_v1::create_market(user_1, USDC, S_INIT, 80, 1000000, 1000000, 80, 2000000);
    }

    #[test(deployer = @weavelink)]
    #[expected_failure(abort_code = market_v1::EINVALID_AMOUNT)]
    fun test_cannot_create_market_same_token(deployer: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        // loan_token == collateral_token should fail
        market_v1::create_market(deployer, USDC, USDC, 80, 1000000, 1000000, 80, 2000000);
    }

    #[test(deployer = @weavelink)]
    #[expected_failure(abort_code = market_v1::EINVALID_AMOUNT)]
    fun test_cannot_create_market_lltv_over_100(deployer: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        market_v1::create_market(deployer, USDC, S_INIT, 101, 1000000, 1000000, 80, 2000000);
    }

    #[test(deployer = @weavelink)]
    fun test_multiple_markets(deployer: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        market_v1::create_market(deployer, USDC, S_INIT, 80, 1000000, 1000000, 80, 2000000);
        market_v1::create_market(deployer, S_INIT, USDC, 70, 500000, 500000, 80, 1000000);

        assert!(market_v1::get_next_market_id() == 3, 100);

        let (loan1, col1, _, _, _, lltv1, _) = market_v1::get_market(1);
        assert!(loan1 == USDC, 101);
        assert!(col1 == S_INIT, 102);
        assert!(lltv1 == 80, 103);

        let (loan2, col2, _, _, _, lltv2, _) = market_v1::get_market(2);
        assert!(loan2 == S_INIT, 104);
        assert!(col2 == USDC, 105);
        assert!(lltv2 == 70, 106);
    }

    // === Authorization Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_set_authorization(deployer: &signer, user_1: &signer, user_2: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        // user_1 authorizes user_2
        market_v1::set_authorization(user_1, @0x2222, true);
        assert!(market_v1::is_delegate_authorized(@0x1111, @0x2222), 100);

        // Revoke authorization
        market_v1::set_authorization(user_1, @0x2222, false);
        assert!(!market_v1::is_delegate_authorized(@0x1111, @0x2222), 101);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::ESAME_ADDRESS)]
    fun test_cannot_authorize_self(deployer: &signer, user_1: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        market_v1::set_authorization(user_1, @0x1111, true);
    }

    // === Supply Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    fun test_supply_and_withdraw(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        // Supply 1000 USDC
        market_v1::supply(user_1, @0x1111, 1, 1000);

        // Check position
        let (supplied, borrowed, collateral) = market_v1::get_position(@0x1111, 1);
        assert!(supplied == 1000, 100);
        assert!(borrowed == 0, 101);
        assert!(collateral == 0, 102);

        // Check market totals
        let (_, _, total_supply, _, _, _, _) = market_v1::get_market(1);
        assert!(total_supply == 1000, 103);

        // Check user balance decreased
        assert!(mock_tokens::balance_of(@0x1111, USDC) == 9000, 104);

        // Withdraw 500
        market_v1::withdraw(user_1, @0x1111, 1, 500);

        let (supplied2, _, _) = market_v1::get_position(@0x1111, 1);
        assert!(supplied2 == 500, 105);
        assert!(mock_tokens::balance_of(@0x1111, USDC) == 9500, 106);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_supply_on_behalf(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // user_1 authorizes user_2
        market_v1::set_authorization(user_1, @0x2222, true);

        // user_2 supplies on behalf of user_1
        market_v1::supply(user_2, @0x1111, 1, 1000);

        // Position belongs to user_1, not user_2
        let (supplied1, _, _) = market_v1::get_position(@0x1111, 1);
        assert!(supplied1 == 1000, 100);

        let (supplied2, _, _) = market_v1::get_position(@0x2222, 1);
        assert!(supplied2 == 0, 101);

        // user_2's balance decreased
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 9000, 102);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    #[expected_failure(abort_code = market_v1::ENOT_AUTHORIZED)]
    fun test_cannot_supply_without_authorization(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // user_2 tries to supply on behalf of user_1 without authorization
        market_v1::supply(user_2, @0x1111, 1, 1000);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINVALID_AMOUNT)]
    fun test_cannot_supply_zero(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);
        market_v1::supply(user_1, @0x1111, 1, 0);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINSUFFICIENT_COLLATERAL)]
    fun test_cannot_supply_more_than_balance(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        // User has 10000 USDC, try to supply 15000
        market_v1::supply(user_1, @0x1111, 1, 15000);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINVALID_AMOUNT)]
    fun test_cannot_withdraw_zero(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);
        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::withdraw(user_1, @0x1111, 1, 0);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINSUFFICIENT_COLLATERAL)]
    fun test_cannot_withdraw_more_than_supplied(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);
        market_v1::supply(user_1, @0x1111, 1, 500);
        market_v1::withdraw(user_1, @0x1111, 1, 1000);
    }

    // === Collateral Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINSUFFICIENT_COLLATERAL)]
    fun test_cannot_supply_collateral_more_than_balance(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        // User has 10000 S_INIT, try to supply 15000
        market_v1::supply_collateral(user_1, @0x1111, 1, 15000);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    fun test_withdraw_collateral_no_borrow(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        // Supply collateral (no borrow, so health factor is infinite)
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        assert!(mock_tokens::balance_of(@0x1111, S_INIT) == 9000, 100);

        // Should be able to withdraw all collateral (no borrow = healthy)
        market_v1::withdraw_collateral(user_1, @0x1111, 1, 1000);
        assert!(mock_tokens::balance_of(@0x1111, S_INIT) == 10000, 101);

        let (_, _, collateral) = market_v1::get_position(@0x1111, 1);
        assert!(collateral == 0, 102);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_withdraw_collateral_maintains_health(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // Supply liquidity
        market_v1::supply(user_1, @0x1111, 1, 1000);
        // Supply collateral
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        // Borrow 400 USDC (with 80% LLTV, max borrow = 1000 * 1e6 * 80/100 = 800 * 1e6)
        market_v1::borrow(user_1, @0x1111, 1, 400);

        // Withdraw partial collateral (500), still healthy
        // After: collateral=500, max_borrow = 500 * 1e6 * 80/100 = 400 * 1e6, borrowed = 400 * 1e6
        // Just barely healthy
        market_v1::withdraw_collateral(user_1, @0x1111, 1, 500);

        let (_, borrowed, collateral) = market_v1::get_position(@0x1111, 1);
        assert!(collateral == 500, 100);
        assert!(borrowed == 400, 101);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    #[expected_failure(abort_code = market_v1::EHEALTH_FACTOR_BELOW_ONE)]
    fun test_cannot_withdraw_collateral_below_health(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // Supply liquidity
        market_v1::supply(user_1, @0x1111, 1, 1000);
        // Supply collateral
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        // Borrow 400 USDC
        market_v1::borrow(user_1, @0x1111, 1, 400);

        // Try to withdraw too much collateral (600)
        // After: collateral=400, max_borrow = 400 * 1e6 * 80/100 = 320 * 1e6
        // borrowed = 400 * 1e6, 400 > 320 => unhealthy
        market_v1::withdraw_collateral(user_1, @0x1111, 1, 600);
    }

    // === Borrow Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_borrow_and_repay(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // Supply liquidity
        market_v1::supply(user_1, @0x1111, 1, 1000);
        // Supply collateral
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);

        // Borrow 500 USDC
        market_v1::borrow(user_1, @0x1111, 1, 500);
        assert!(mock_tokens::balance_of(@0x1111, USDC) == 9500, 100); // 10000 - 1000 + 500

        let (supplied, borrowed, collateral) = market_v1::get_position(@0x1111, 1);
        assert!(supplied == 1000, 101);
        assert!(borrowed == 500, 102);
        assert!(collateral == 1000, 103);

        // Repay 200 USDC
        market_v1::repay(user_1, @0x1111, 1, 200);
        assert!(mock_tokens::balance_of(@0x1111, USDC) == 9300, 104); // 9500 - 200

        let (_, borrowed2, _) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed2 == 300, 105);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_full_repay_borrow(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        market_v1::borrow(user_1, @0x1111, 1, 500);

        // Repay all
        market_v1::repay(user_1, @0x1111, 1, 500);

        let (_, borrowed, _) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 0, 100);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINVALID_AMOUNT)]
    fun test_cannot_borrow_zero(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);
        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        market_v1::borrow(user_1, @0x1111, 1, 0);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EHEALTH_FACTOR_BELOW_ONE)]
    fun test_cannot_borrow_above_ltv(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);

        // With lltv=80, max borrow = 1000 * 1e6 * 80/100 / 1e6 = 800
        // Try to borrow 900 => should fail
        market_v1::borrow(user_1, @0x1111, 1, 900);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111)]
    #[expected_failure(abort_code = market_v1::EINSUFFICIENT_LIQUIDITY)]
    fun test_cannot_borrow_more_than_liquidity(deployer: &signer, user_1: &signer) {
        setup_all(deployer, user_1, user_1);

        // Only 1000 USDC supplied
        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 10000);

        // Try to borrow 2000 when only 1000 available
        market_v1::borrow(user_1, @0x1111, 1, 2000);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_repay_more_than_borrowed(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        market_v1::supply(user_1, @0x1111, 1, 500);
        market_v1::supply_collateral(user_1, @0x1111, 1, 500);
        market_v1::borrow(user_1, @0x1111, 1, 50);

        // User has: 10000 - 500 + 50 = 9550 USDC
        // Repay 100 when only 50 borrowed => should cap at 50
        market_v1::repay(user_1, @0x1111, 1, 100);

        let (_, borrowed, _) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 0, 100);
    }

    // === Health Factor Tests ===

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_health_factor_no_borrow(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);

        // No borrow => health factor = 100 (HEALTH_SCALE)
        let hf = market_v1::get_health_factor(@0x1111, 1);
        assert!(hf == 100, 100);
    }

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_health_factor_calculation(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        market_v1::supply(user_1, @0x1111, 1, 1000);
        market_v1::supply_collateral(user_1, @0x1111, 1, 1000);
        market_v1::borrow(user_1, @0x1111, 1, 100);

        // collateral=1000, borrowed=100, lltv=80, prices=1e6
        // borrowed_value = 100 * 1e6 = 100000000
        // max_borrow_value = 1000 * 1e6 * 80 / 100 = 800000000
        // hf = 800000000 * 100 / 100000000 = 800
        let hf = market_v1::get_health_factor(@0x1111, 1);
        assert!(hf == 800, 100);
    }

    // === Liquidation Test ===

    #[test(deployer = @weavelink, user_1 = @0x1111, user_2 = @0x2222)]
    fun test_liquidation(deployer: &signer, user_1: &signer, user_2: &signer) {
        setup_all(deployer, user_1, user_2);

        // user_1 supplies liquidity
        market_v1::supply(user_1, @0x1111, 1, 500);
        // user_1 supplies collateral
        market_v1::supply_collateral(user_1, @0x1111, 1, 100);
        // user_1 borrows 80 USDC (max with lltv=80: 100*0.8=80)
        market_v1::borrow(user_1, @0x1111, 1, 80);

        // user_1 balance: 10000 - 500 + 80 = 9580 USDC, 10000 - 100 = 9900 S_INIT

        // Drop collateral price to make position unhealthy
        // New collateral price = 500000 ($0.5)
        // max_borrow = 100 * 500000 * 80 / 100 = 4000000
        // borrowed_value = 80 * 1000000 = 80000000
        // 4000000 < 80000000 => unhealthy!
        price_oracle::set_price(deployer, S_INIT, 500000);

        // user_2 liquidates user_1
        market_v1::liquidate(user_2, @0x1111, 1, 80);

        // user_1 should have borrowed = 0, collateral = 20 (100 - 80 seized)
        let (_, borrowed, collateral) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 0, 100);
        assert!(collateral == 20, 101);

        // user_2 should have received seized collateral
        assert!(mock_tokens::balance_of(@0x2222, S_INIT) == 10000 + 80, 102);
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 10000 - 80, 103);
    }

    // === Price Oracle Tests ===

    #[test(deployer = @weavelink)]
    fun test_set_and_get_price(deployer: &signer) {
        price_oracle::init_for_testing(deployer);

        // Default price is 1e6 ($1)
        assert!(price_oracle::get_oracle_price(USDC) == 1000000, 100);

        // Set new price
        price_oracle::set_price(deployer, USDC, 2000000);
        assert!(price_oracle::get_oracle_price(USDC) == 2000000, 101);
    }

    // === Operations on Nonexistent Market ===

    #[test(deployer = @weavelink)]
    fun test_operations_on_nonexistent_market(deployer: &signer) {
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        // View functions should return 0s
        let (loan, col, supply, borrow, col_amt, lltv, rate) = market_v1::get_market(999);
        assert!(loan == 0, 100);
        assert!(col == 0, 101);
        assert!(supply == 0, 102);
        assert!(borrow == 0, 103);
        assert!(col_amt == 0, 104);
        assert!(lltv == 0, 105);
        assert!(rate == 0, 106);

        let (s, b, c) = market_v1::get_position(@0x1111, 999);
        assert!(s == 0, 107);
        assert!(b == 0, 108);
        assert!(c == 0, 109);

        // Health factor for nonexistent market = 0
        let hf = market_v1::get_health_factor(@0x1111, 999);
        assert!(hf == 0, 110);

        // Health factor with no position = 100
        let hf2 = market_v1::get_health_factor(@0x1111, 1);
        assert!(hf2 == 0, 111); // market 1 doesn't exist either
    }
}