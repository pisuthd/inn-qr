#[test_only]
module weavelink::test_operator {

    use std::signer;

    use weavelink::market_v1;
    use weavelink::mock_tokens;
    use weavelink::operator;
    use weavelink::price_oracle;

    // === Test Accounts ===
    // deployer: @weavelink - admin, creates markets
    // user: @0x1111 - supplies collateral, borrows
    // operator_1: @0x2222 - registered operator
    // operator_2: @0x3333 - second operator
    // random: @0x4444 - unauthorized address

    // === Setup Helpers ===

    fun setup_all(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        // Initialize all modules
        mock_tokens::init_for_testing(deployer);
        market_v1::init_module_for_testing(deployer);
        price_oracle::init_for_testing(deployer);
        operator::init_for_testing(deployer);

        // Set prices: USDC = $1, S_INIT = $2
        price_oracle::set_price(deployer, 0, 1000000);  // USDC
        price_oracle::set_price(deployer, 1, 2000000);  // S_INIT

        // Create market: USDC (loan=0) / S_INIT (collateral=1), LLTV=80%
        market_v1::create_market(deployer, 0, 1, 80, 100, 1000, 80, 2000);

        // Mint tokens
        mock_tokens::mint(deployer, @0x1111, 1, 10000);  // user gets S_INIT (collateral)
        mock_tokens::mint(deployer, @0x2222, 0, 5000);   // operator_1 gets USDC (to supply liquidity)
        mock_tokens::mint(deployer, @0x3333, 0, 5000);   // operator_2 gets USDC

        // Each account supplies their own tokens (caller == on_behalf, no auth needed)
        market_v1::supply(operator_1, @0x2222, 1, 3000);    // operator_1 supplies own 3000 USDC
        market_v1::supply(operator_2, @0x3333, 1, 2000);    // operator_2 supplies own 2000 USDC
        market_v1::supply_collateral(user, @0x1111, 1, 10000);  // user locks own 10000 S_INIT

        // Register operator_1
        operator::register_operator(deployer, @0x2222);
    }

    // Full setup including user authorization for operator
    fun setup_with_authorization(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        // User authorizes operators to act on their behalf
        market_v1::set_authorization(user, signer::address_of(operator_1), true);
        market_v1::set_authorization(user, signer::address_of(operator_2), true);
    }

    // Helper: compute a secret hash
    fun make_secret_hash(): vector<u8> {
        let secret = b"my_secret_preimage_12345";
        operator::compute_secret_hash(secret)
    }

    fun make_secret_hash_with(secret: vector<u8>): vector<u8> {
        operator::compute_secret_hash(secret)
    }

    // === Operator Registry Tests ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_register_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        assert!(operator::is_operator_registered(@0x2222), 1);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_register_second_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        operator::register_operator(deployer, @0x3333);
        assert!(operator::is_operator_registered(@0x3333), 1);
        assert!(operator::is_operator_registered(@0x2222), 2);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333, random = @0x4444)]
    #[expected_failure]
    fun test_register_operator_unauthorized(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer,
        random: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        // Non-admin cannot register operators
        operator::register_operator(random, @0x5555);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_register_operator_twice(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        // operator_1 already registered in setup
        operator::register_operator(deployer, @0x2222);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_deregister_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        assert!(operator::is_operator_registered(@0x2222), 1);
        operator::deregister_operator(deployer, @0x2222);
        assert!(!operator::is_operator_registered(@0x2222), 2);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_deregister_nonexistent_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        operator::deregister_operator(deployer, @0x4444);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_cannot_register_self_as_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_all(deployer, user, operator_1, operator_2);
        // Admin cannot register themselves as operator
        operator::register_operator(deployer, @weavelink);
    }

    #[test]
    fun test_operator_not_registered_when_no_store() {
        // Before initialization, no one is an operator
        assert!(!operator::is_operator_registered(@0x2222), 1);
    }

    // === HTLC Withdrawal Tests (Fiat) ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_create_withdrawal_fiat(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // Operator creates withdrawal: borrow 500 USDC from user, lock in escrow
        operator::create_withdrawal(
            operator_1,
            @0x1111,        // user
            1,              // market_id
            500,            // amount
            secret_hash,    // HTLC secret hash
            100000,         // timeout (far future)
            0,              // destination_type = fiat
            b"bank_details_hash"
        );

        // Verify escrow was created
        let (req_id, op, escrow_user, token_id, amount, dest_type, status) =
            operator::get_escrow(1);
        assert!(req_id == 1, 1);
        assert!(op == @0x2222, 2);
        assert!(escrow_user == @0x1111, 3);
        assert!(token_id == 0, 4);  // USDC
        assert!(amount == 500, 5);
        assert!(dest_type == 0, 6);  // fiat
        assert!(status == operator::status_locked(), 7);

        // Verify user has borrow debt
        let (_supplied, borrowed, _collateral) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 500, 8);

        // Verify user escrow count
        assert!(operator::get_user_escrow_count(@0x1111) == 1, 9);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_claim_escrow_fiat(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"my_secret_preimage_12345";
        let secret_hash = make_secret_hash_with(copy secret);

        // Create withdrawal
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );

        // Operator's USDC balance before claim
        let op_balance_before = mock_tokens::balance_of(@0x2222, 0);

        // Operator claims escrow by revealing secret
        operator::claim_escrow(operator_1, 1, secret);

        // Verify escrow status
        let (_, _, _, _, amount, _, status) = operator::get_escrow(1);
        assert!(status == operator::status_claimed(), 1);
        assert!(amount == 500, 2);

        // Verify operator received USDC
        let op_balance_after = mock_tokens::balance_of(@0x2222, 0);
        assert!(op_balance_after == op_balance_before + 500, 3);
    }

    // === HTLC Withdrawal Tests (Cross-Chain) ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_create_withdrawal_cross_chain(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        operator::create_withdrawal(
            operator_1,
            @0x1111,                        // user
            1,                              // market_id
            300,                            // amount
            secret_hash,                    // HTLC secret hash
            200000,                         // timeout
            1,                              // destination_type = cross_chain
            b"cosmos1abc..."                // destination chain address
        );

        let (_, _, _, token_id, amount, dest_type, status) =
            operator::get_escrow(1);
        assert!(token_id == 0, 1);
        assert!(amount == 300, 2);
        assert!(dest_type == 1, 3);  // cross_chain
        assert!(status == operator::status_locked(), 4);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_claim_escrow_cross_chain(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"cross_chain_secret";
        let secret_hash = make_secret_hash_with(copy secret);

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 400, secret_hash, 200000, 1, b"0xABC..."
        );

        // Claim with correct secret
        operator::claim_escrow(operator_1, 1, secret);

        let (_, _, _, _, _, _, status) = operator::get_escrow(1);
        assert!(status == operator::status_claimed(), 1);

        // Operator received USDC
        assert!(mock_tokens::balance_of(@0x2222, 0) >= 400, 2);
    }

    // === HTLC Refund Tests ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_refund_after_timeout(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // Create withdrawal with timeout at 1000
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 1000, 0, b"bank_hash"
        );

        // User's USDC balance before refund
        let user_usdc_before = mock_tokens::balance_of(@0x1111, 0);

        // Time has passed timeout - user refunds
        operator::refund_escrow(user, 1, 2000);  // current_time=2000 > timeout=1000

        // Verify escrow status
        let (_, _, _, _, amount, _, status) = operator::get_escrow(1);
        assert!(status == operator::status_refunded(), 1);
        assert!(amount == 500, 2);

        // Verify user received USDC
        let user_usdc_after = mock_tokens::balance_of(@0x1111, 0);
        assert!(user_usdc_after == user_usdc_before + 500, 3);

        // Verify borrow debt still exists (not auto-repaid)
        let (_supplied, borrowed, _collateral) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 500, 4);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_refund_before_timeout_fails(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // Create withdrawal with timeout at 5000
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 5000, 0, b"bank_hash"
        );

        // Try to refund before timeout (current_time=3000 < timeout=5000)
        operator::refund_escrow(user, 1, 3000);
    }

    // === HTLC Wrong Secret Test ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_claim_wrong_secret(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );

        // Try to claim with wrong secret
        operator::claim_escrow(operator_1, 1, b"wrong_secret");
    }

    // === HTLC Wrong Operator Claim Test ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_claim_wrong_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"my_secret_preimage_12345";
        let secret_hash = make_secret_hash_with(copy secret);

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );

        // Register operator_2 and try to claim operator_1's escrow
        operator::register_operator(deployer, @0x3333);
        operator::claim_escrow(operator_2, 1, secret);
    }

    // === HTLC Double Action Tests ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_double_claim_fails(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"my_secret_preimage_12345";
        let secret_hash = make_secret_hash_with(copy secret);

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );

        // First claim succeeds
        operator::claim_escrow(operator_1, 1, copy secret);

        // Second claim should fail
        operator::claim_escrow(operator_1, 1, secret);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_refund_after_claim_fails(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"my_secret_preimage_12345";
        let secret_hash = make_secret_hash_with(copy secret);

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 1000, 0, b"bank_hash"
        );

        // Claim succeeds
        operator::claim_escrow(operator_1, 1, secret);

        // Try to refund after claim (even though timeout passed)
        operator::refund_escrow(user, 1, 2000);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_claim_after_refund_fails(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret = b"my_secret_preimage_12345";
        let secret_hash = make_secret_hash_with(copy secret);

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 1000, 0, b"bank_hash"
        );

        // Refund after timeout
        operator::refund_escrow(user, 1, 2000);

        // Try to claim after refund
        operator::claim_escrow(operator_1, 1, secret);
    }

    // === Edge Case Tests ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_create_withdrawal_unregistered_operator(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // operator_2 is not registered - should fail
        operator::create_withdrawal(
            operator_2, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_create_withdrawal_not_authorized_by_user(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        // Setup without operator authorization (setup_all doesn't authorize operators)
        setup_all(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // User has NOT authorized operator - borrow should fail
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_create_withdrawal_zero_amount(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 0, secret_hash, 100000, 0, b"bank_hash"
        );
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_create_withdrawal_invalid_destination(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // destination_type = 5 is invalid (only 0 and 1 are valid)
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 5, b"bad"
        );
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_create_withdrawal_insufficient_collateral(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        // User has 10000 S_INIT at $2 = $20000 collateral
        // With LLTV=80%, max borrow = $16000 = 16000 USDC
        // Try to borrow 20000 USDC - should fail
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 20000, secret_hash, 100000, 0, b"bank_hash"
        );
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_refund_wrong_user(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret_hash = make_secret_hash();

        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 1000, 0, b"bank_hash"
        );

        // operator_1 tries to refund - should fail (only @0x1111 can refund)
        operator::refund_escrow(operator_1, 1, 2000);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_nonexistent_escrow(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        // Try to claim escrow that doesn't exist
        let secret = b"anything";
        operator::claim_escrow(operator_1, 999, secret);
    }

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    #[expected_failure]
    fun test_deregistered_operator_cannot_withdraw(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        // Deregister operator
        operator::deregister_operator(deployer, @0x2222);

        let secret_hash = make_secret_hash();

        // Now operator cannot create withdrawals
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );
    }

    // === View Function Tests ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_view_functions(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        // Test is_operator_registered
        assert!(operator::is_operator_registered(@0x2222), 1);
        assert!(!operator::is_operator_registered(@0x3333), 2);
        assert!(!operator::is_operator_registered(@0x4444), 3);

        // Test get_next_request_id before any requests
        assert!(operator::get_next_request_id() == 1, 4);

        // Create a withdrawal
        let secret_hash = make_secret_hash();
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, secret_hash, 100000, 0, b"bank_hash"
        );

        // Test get_next_request_id after request
        assert!(operator::get_next_request_id() == 2, 5);

        // Test get_escrow
        let (req_id, op, escrow_user, token_id, amount, dest_type, status) =
            operator::get_escrow(1);
        assert!(req_id == 1, 6);
        assert!(op == @0x2222, 7);
        assert!(escrow_user == @0x1111, 8);
        assert!(token_id == 0, 9);
        assert!(amount == 500, 10);
        assert!(dest_type == 0, 11);
        assert!(status == operator::status_locked(), 12);

        // Test get_user_escrow_count
        assert!(operator::get_user_escrow_count(@0x1111) == 1, 13);
        assert!(operator::get_user_escrow_count(@0x2222) == 0, 14);

        // Test nonexistent escrow
        let (req_id2, _, _, _, _, _, _) = operator::get_escrow(999);
        assert!(req_id2 == 0, 15);
    }

    #[test]
    fun test_constants() {
        assert!(operator::destination_fiat() == 0, 1);
        assert!(operator::destination_cross_chain() == 1, 2);
        assert!(operator::status_locked() == 0, 3);
        assert!(operator::status_claimed() == 1, 4);
        assert!(operator::status_refunded() == 2, 5);
    }

    // === Sequential Withdrawal Test ===

    #[test(deployer = @weavelink, user = @0x1111, operator_1 = @0x2222, operator_2 = @0x3333)]
    fun test_multiple_withdrawals(
        deployer: &signer,
        user: &signer,
        operator_1: &signer,
        operator_2: &signer
    ) {
        setup_with_authorization(deployer, user, operator_1, operator_2);

        let secret1 = b"secret_one";
        let secret2 = b"secret_two";
        let hash1 = make_secret_hash_with(copy secret1);
        let hash2 = make_secret_hash_with(copy secret2);

        // First withdrawal: fiat
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 500, hash1, 100000, 0, b"bank_hash_1"
        );

        // Second withdrawal: cross-chain
        operator::create_withdrawal(
            operator_1, @0x1111, 1, 300, hash2, 200000, 1, b"0xDEF..."
        );

        // Verify both escrows
        assert!(operator::get_user_escrow_count(@0x1111) == 2, 1);

        let (_, _, _, _, amt1, dt1, _) = operator::get_escrow(1);
        assert!(amt1 == 500, 2);
        assert!(dt1 == 0, 3);

        let (_, _, _, _, amt2, dt2, _) = operator::get_escrow(2);
        assert!(amt2 == 300, 4);
        assert!(dt2 == 1, 5);

        // Claim first, refund second
        operator::claim_escrow(operator_1, 1, secret1);
        operator::refund_escrow(user, 2, 300000);

        // Verify statuses
        let (_, _, _, _, _, _, s1) = operator::get_escrow(1);
        assert!(s1 == operator::status_claimed(), 6);

        let (_, _, _, _, _, _, s2) = operator::get_escrow(2);
        assert!(s2 == operator::status_refunded(), 7);

        // Total borrow = 500 + 300 = 800
        let (_, borrowed, _) = market_v1::get_position(@0x1111, 1);
        assert!(borrowed == 800, 8);
    }
}