#[test_only]
module weavelink::test_authorization {

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

    // === Supply on behalf ===

    // Authorized delegate can supply on behalf of delegator
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    fun test_supply_on_behalf_authorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Delegator authorizes delegate
        market::set_authorization(delegator, @0x2222, true);

        // Delegate supplies USDC on behalf of delegator
        market::supply(delegate, @0x1111, 1, 2000);

        // Position belongs to delegator
        let (supplied, _, _) = market::get_position(@0x1111, 1);
        assert!(supplied == 2000, 100);

        // Delegate's balance decreased
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 8000, 101);
    }

    // Cannot supply on behalf without authorization
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_supply_on_behalf_unauthorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // No authorization set, delegate tries to supply on behalf
        market::supply(delegate, @0x1111, 1, 1000);
    }

    // === Borrow on behalf ===

    // Authorized delegate can borrow on behalf of delegator
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    fun test_borrow_on_behalf_authorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Delegator supplies liquidity and collateral
        market::supply(delegator, @0x1111, 1, 5000);
        market::supply_collateral(delegator, @0x1111, 1, 5000);

        // Authorize delegate
        market::set_authorization(delegator, @0x2222, true);

        // Delegate borrows on behalf of delegator
        market::borrow(delegate, @0x1111, 1, 500);

        // Debt belongs to delegator, tokens go to delegate
        let (_, borrowed, _) = market::get_position(@0x1111, 1);
        assert!(borrowed == 500, 100);

        // Delegate receives the borrowed tokens
        assert!(mock_tokens::balance_of(@0x2222, USDC) == 10500, 101);
    }

    // Cannot borrow on behalf without authorization
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_borrow_on_behalf_unauthorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(delegator, @0x1111, 1, 5000);
        market::supply_collateral(delegator, @0x1111, 1, 5000);

        // No authorization, delegate tries to borrow on behalf
        market::borrow(delegate, @0x1111, 1, 500);
    }

    // === Collateral supply on behalf ===

    // Authorized delegate can supply collateral on behalf
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    fun test_supply_collateral_on_behalf_authorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::set_authorization(delegator, @0x2222, true);

        // Delegate supplies collateral on behalf of delegator
        market::supply_collateral(delegate, @0x1111, 1, 3000);

        let (_, _, collateral) = market::get_position(@0x1111, 1);
        assert!(collateral == 3000, 100);

        // Delegate's S_INIT balance decreased
        assert!(mock_tokens::balance_of(@0x2222, S_INIT) == 7000, 101);
    }

    // Cannot supply collateral on behalf without authorization
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_supply_collateral_on_behalf_unauthorized(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // No authorization
        market::supply_collateral(delegate, @0x1111, 1, 1000);
    }

    // === Revoke authorization ===

    // After revoking, delegate can no longer act on behalf
    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_revoke_authorization_then_supply(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // Authorize then revoke
        market::set_authorization(delegator, @0x2222, true);
        market::set_authorization(delegator, @0x2222, false);

        // Should fail now
        market::supply(delegate, @0x1111, 1, 1000);
    }

    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_revoke_authorization_then_borrow(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        market::supply(delegator, @0x1111, 1, 5000);
        market::supply_collateral(delegator, @0x1111, 1, 5000);

        // Authorize, borrow successfully, then revoke
        market::set_authorization(delegator, @0x2222, true);
        market::borrow(delegate, @0x1111, 1, 100);
        market::set_authorization(delegator, @0x2222, false);

        // Now borrowing should fail
        market::borrow(delegate, @0x1111, 1, 100);
    }

    // === Multiple delegates ===

    // User can authorize multiple different delegates
    #[test(deployer = @weavelink, delegator = @0x1111, delegate_a = @0x2222, delegate_b = @0x3333)]
    fun test_multiple_delegates(deployer: &signer, delegator: &signer, delegate_a: &signer, delegate_b: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);
        fund_user(deployer, @0x3333, 10000, 10000);

        // Authorize both delegates
        market::set_authorization(delegator, @0x2222, true);
        market::set_authorization(delegator, @0x3333, true);

        assert!(market::is_delegate_authorized(@0x1111, @0x2222), 100);
        assert!(market::is_delegate_authorized(@0x1111, @0x3333), 101);

        // Both can supply on behalf
        market::supply(delegate_a, @0x1111, 1, 1000);
        market::supply(delegate_b, @0x1111, 1, 2000);

        let (supplied, _, _) = market::get_position(@0x1111, 1);
        assert!(supplied == 3000, 102);
    }

    // Revoking one delegate doesn't affect another
    #[test(deployer = @weavelink, delegator = @0x1111, delegate_a = @0x2222, delegate_b = @0x3333)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_revoke_one_delegate_keeps_other(deployer: &signer, delegator: &signer, delegate_a: &signer, delegate_b: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);
        fund_user(deployer, @0x3333, 10000, 10000);

        // Authorize both
        market::set_authorization(delegator, @0x2222, true);
        market::set_authorization(delegator, @0x3333, true);

        // Revoke delegate_a only
        market::set_authorization(delegator, @0x2222, false);

        // delegate_b still works
        market::supply(delegate_b, @0x1111, 1, 1000);
        let (supplied, _, _) = market::get_position(@0x1111, 1);
        assert!(supplied == 1000, 100);

        // delegate_a should fail now
        market::supply(delegate_a, @0x1111, 1, 1000);
    }

    // === Authorization isolation ===

    // Delegate authorized by user A cannot act for user B
    #[test(deployer = @weavelink, user_a = @0x1111, user_b = @0x2222, delegate = @0x3333)]
    #[expected_failure(abort_code = market::ENOT_AUTHORIZED)]
    fun test_authorization_isolation(deployer: &signer, user_a: &signer, user_b: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);
        fund_user(deployer, @0x3333, 10000, 10000);

        // user_a authorizes delegate
        market::set_authorization(user_a, @0x3333, true);

        // delegate CANNOT supply on behalf of user_b
        market::supply(delegate, @0x2222, 1, 1000);
    }

    // Delegate authorized by A works for A but not for B
    #[test(deployer = @weavelink, user_a = @0x1111, user_b = @0x2222, delegate = @0x3333)]
    fun test_authorization_per_user(deployer: &signer, user_a: &signer, user_b: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x3333, 10000, 10000);

        // user_a authorizes delegate
        market::set_authorization(user_a, @0x3333, true);

        // delegate can supply for user_a
        market::supply(delegate, @0x1111, 1, 1000);
        let (supplied, _, _) = market::get_position(@0x1111, 1);
        assert!(supplied == 1000, 100);

        // But is_delegate_authorized returns false for user_b
        assert!(!market::is_delegate_authorized(@0x2222, @0x3333), 101);
    }

    // === Self operations (no authorization needed) ===

    // User supplying/borrowing on their own behalf doesn't need authorization
    #[test(deployer = @weavelink, user = @0x1111)]
    fun test_self_operations_no_auth_needed(deployer: &signer, user: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);

        // Supply on own behalf - no authorization needed
        market::supply(user, @0x1111, 1, 2000);
        market::supply_collateral(user, @0x1111, 1, 3000);
        market::borrow(user, @0x1111, 1, 500);

        let (supplied, borrowed, collateral) = market::get_position(@0x1111, 1);
        assert!(supplied == 2000, 100);
        assert!(borrowed == 500, 101);
        assert!(collateral == 3000, 102);
    }

    // === Cannot authorize self ===

    #[test(deployer = @weavelink, user = @0x1111)]
    #[expected_failure(abort_code = market::ESAME_ADDRESS)]
    fun test_cannot_authorize_self(deployer: &signer, user: &signer) {
        setup(deployer);
        market::set_authorization(user, @0x1111, true);
    }

    // === Full flow: authorize, operate, revoke ===

    #[test(deployer = @weavelink, delegator = @0x1111, delegate = @0x2222)]
    fun test_full_authorization_flow(deployer: &signer, delegator: &signer, delegate: &signer) {
        setup(deployer);
        fund_user(deployer, @0x1111, 10000, 10000);
        fund_user(deployer, @0x2222, 10000, 10000);

        // 1. Check no authorization
        assert!(!market::is_delegate_authorized(@0x1111, @0x2222), 100);

        // 2. Authorize
        market::set_authorization(delegator, @0x2222, true);
        assert!(market::is_delegate_authorized(@0x1111, @0x2222), 101);

        // 3. Delegate supplies collateral on behalf
        market::supply_collateral(delegate, @0x1111, 1, 5000);

        // 4. Delegator also supplies liquidity themselves
        market::supply(delegator, @0x1111, 1, 5000);

        // 5. Delegate borrows on behalf
        market::borrow(delegate, @0x1111, 1, 1000);

        // 6. Verify position
        let (supplied, borrowed, collateral) = market::get_position(@0x1111, 1);
        assert!(supplied == 5000, 102);
        assert!(borrowed == 1000, 103);
        assert!(collateral == 5000, 104);

        // 7. Revoke authorization
        market::set_authorization(delegator, @0x2222, false);
        assert!(!market::is_delegate_authorized(@0x1111, @0x2222), 106);
    }
}