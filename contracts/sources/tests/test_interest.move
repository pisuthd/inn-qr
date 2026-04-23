#[test_only]
module weavelink::test_interest {

    use weavelink::market;
    use weavelink::mock_tokens;
    use weavelink::price_oracle;

    // Token IDs
    const USDC: u8 = 0;
    const S_INIT: u8 = 1;

    // Market params: base_rate=1000000, slope=1000000, kink=80, jump_rate=2000000

    // === Setup ===

    fun setup(deployer: &signer) {
        market::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);
        // base_rate=1e6, slope=1e6, kink=80, jump_rate=2e6
        market::create_market(deployer, USDC, S_INIT, 80, 1000000, 1000000, 80, 2000000);
    }

    // Fund a user with tokens
    fun fund_user(deployer: &signer, user: address, usdc_amount: u64, sinit_amount: u64) {
        mock_tokens::mint(deployer, user, USDC, usdc_amount);
        mock_tokens::mint(deployer, user, S_INIT, sinit_amount);
    }

    // === Borrow Rate Tests ===

    // At 0% utilization (no borrow), rate should equal base_rate
    #[test(deployer = @weavelink, user = @0x1111)]
    fun test_borrow_rate_zero_utilization(deployer: &signer, user: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);

        // Supply but don't borrow
        market::supply(user, @0x1111, 1, 10000);

        let (_, _, _, _, _, _, rate) = market::get_market(1);
        // 0% utilization => base_rate = 1000000
        assert!(rate == 1000000, 100);
    }

    // At 50% utilization (below kink=80), rate = base + slope * util / kink
    #[test(deployer = @weavelink, supplier = @0x1111, borrower = @0x2222)]
    fun test_borrow_rate_below_kink(deployer: &signer, supplier: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Supplier deposits 10000 USDC
        market::supply(supplier, @0x1111, 1, 10000);

        // Borrower supplies collateral and borrows 5000 (50% utilization)
        market::supply_collateral(borrower, @0x2222, 1, 10000);
        market::borrow(borrower, @0x2222, 1, 5000);

        // rate = base + slope * 50 / 80 = 1000000 + 625000 = 1625000
        let (_, _, _, _, _, _, rate) = market::get_market(1);
        assert!(rate == 1625000, 100);
    }

    // At exactly kink (80% utilization), rate = base + slope
    #[test(deployer = @weavelink, supplier = @0x1111, borrower = @0x2222)]
    fun test_borrow_rate_at_kink(deployer: &signer, supplier: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Supply 10000
        market::supply(supplier, @0x1111, 1, 10000);

        // Borrow 8000 (80% utilization = kink)
        market::supply_collateral(borrower, @0x2222, 1, 10000);
        market::borrow(borrower, @0x2222, 1, 8000);

        // rate = base + slope = 1000000 + 1000000 = 2000000
        let (_, _, _, _, _, _, rate) = market::get_market(1);
        assert!(rate == 2000000, 100);
    }

    // Above kink (90% utilization), rate includes jump component
    #[test(deployer = @weavelink, supplier = @0x1111, borrower = @0x2222)]
    fun test_borrow_rate_above_kink(deployer: &signer, supplier: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 12000);

        // Supply 10000
        market::supply(supplier, @0x1111, 1, 10000);

        // Borrow 9000 (90% utilization, above kink of 80)
        // Need 12000 collateral: max_borrow = 12000*1e6*80/100 = 9.6e9 > 9e9
        market::supply_collateral(borrower, @0x2222, 1, 12000);
        market::borrow(borrower, @0x2222, 1, 9000);

        // normal_rate = base + slope = 2000000
        // excess = 90 - 80 = 10
        // max_excess = 100 - 80 = 20
        // rate = 2000000 + 2000000 * 10 / 20 = 2000000 + 1000000 = 3000000
        let (_, _, _, _, _, _, rate) = market::get_market(1);
        assert!(rate == 3000000, 100);
    }

    // Rate changes as utilization changes (repay reduces utilization)
    #[test(deployer = @weavelink, supplier = @0x1111, borrower = @0x2222)]
    fun test_rate_decreases_on_repay(deployer: &signer, supplier: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(supplier, @0x1111, 1, 10000);
        market::supply_collateral(borrower, @0x2222, 1, 10000);

        // Borrow 8000 => 80% util => rate at kink
        market::borrow(borrower, @0x2222, 1, 8000);
        let (_, _, _, _, _, _, rate1) = market::get_market(1);
        assert!(rate1 == 2000000, 100);

        // Repay 4000 => 40% util => below kink
        market::repay(borrower, @0x2222, 1, 4000);
        // rate = 1000000 + 1000000 * 40 / 80 = 1000000 + 500000 = 1500000
        let (_, _, _, _, _, _, rate2) = market::get_market(1);
        assert!(rate2 == 1500000, 101);
    }

    // Rate changes when more supply is added (utilization drops)
    #[test(deployer = @weavelink, supplier1 = @0x1111, supplier2 = @0x2222, borrower = @0x3333)]
    fun test_rate_changes_with_supply(deployer: &signer, supplier1: &signer, supplier2: &signer, borrower: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 0);
        fund_user(deployer, @0x2222, 10000, 0);
        fund_user(deployer, @0x3333, 10000, 10000);

        // First supplier adds 5000
        market::supply(supplier1, @0x1111, 1, 5000);

        // Borrower borrows 4000 (80% util)
        market::supply_collateral(borrower, @0x3333, 1, 10000);
        market::borrow(borrower, @0x3333, 1, 4000);

        let (_, _, _, _, _, _, rate1) = market::get_market(1);
        // 80% util => at kink => rate = 2000000
        assert!(rate1 == 2000000, 100);

        // Second supplier adds 5000 => total supply = 10000, borrow = 4000 => 40% util
        market::supply(supplier2, @0x2222, 1, 5000);
        // rate = 1000000 + 1000000 * 40 / 80 = 1500000
        let (_, _, _, _, _, _, rate2) = market::get_market(1);
        assert!(rate2 == 1500000, 101);
    }

    // Market with different rate parameters (low base rate)
    #[test(deployer = @weavelink, user = @0x1111)]
    fun test_low_base_rate_market(deployer: &signer, user: &signer) {
        market::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);

        // base_rate=0, slope=500000, kink=80, jump_rate=3000000
        market::create_market(deployer, USDC, S_INIT, 80, 0, 500000, 80, 3000000);

        fund_user(deployer, @0x1111, 10000, 10000);

        // Supply but no borrow => base_rate = 0
        market::supply(user, @0x1111, 1, 10000);
        let (_, _, _, _, _, _, rate) = market::get_market(1);
        assert!(rate == 0, 100);
    }

    // Verify market totals track correctly through supply/borrow/repay cycle
    #[test(deployer = @weavelink, user = @0x1111)]
    fun test_market_totals_tracking(deployer: &signer, user: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);

        // Supply 5000
        market::supply(user, @0x1111, 1, 5000);
        let (_, _, supply1, borrow1, collateral1, _, _) = market::get_market(1);
        assert!(supply1 == 5000, 100);
        assert!(borrow1 == 0, 101);
        assert!(collateral1 == 0, 102);

        // Supply collateral 3000
        market::supply_collateral(user, @0x1111, 1, 3000);
        let (_, _, supply2, borrow2, collateral2, _, _) = market::get_market(1);
        assert!(supply2 == 5000, 103);
        assert!(borrow2 == 0, 104);
        assert!(collateral2 == 3000, 105);

        // Borrow 1000
        market::borrow(user, @0x1111, 1, 1000);
        let (_, _, supply3, borrow3, collateral3, _, _) = market::get_market(1);
        assert!(supply3 == 5000, 106);
        assert!(borrow3 == 1000, 107);
        assert!(collateral3 == 3000, 108);

        // Repay 500
        market::repay(user, @0x1111, 1, 500);
        let (_, _, supply4, borrow4, collateral4, _, _) = market::get_market(1);
        assert!(supply4 == 5000, 109);
        assert!(borrow4 == 500, 110);
        assert!(collateral4 == 3000, 111);
    }
}