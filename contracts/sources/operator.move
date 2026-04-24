/// @title Operator Module with HTLC Escrow
/// @notice Manages operator-mediated USDC withdrawals from lending positions
/// @dev Uses HTLC (Hash Time-Locked Contract) for atomic settlement safety
///
/// Flow:
///   1. User locks collateral in market, authorizes operator
///   2. Operator borrows USDC from user's position (on_behalf)
///   3. USDC is locked in HTLC escrow (operator doesn't get tokens yet)
///   4. Operator settles off-chain (fiat transfer or cross-chain bridge)
///   5. Operator proves settlement by revealing secret -> claims USDC
///   6. If timeout -> user claims refund from escrow
module weavelink::operator {

    use std::signer;
    use std::table::{Self, Table};
    use std::vector;
    use std::hash;
    use initia_std::event;

    use weavelink::market_v1;
    use weavelink::mock_tokens;

    // === Constants ===

    // Destination types
    const DESTINATION_FIAT: u8 = 0;
    const DESTINATION_CROSS_CHAIN: u8 = 1;

    // Escrow statuses
    const STATUS_LOCKED: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    const STATUS_REFUNDED: u8 = 2;

    // === Errors ===

    const EUNAUTHORIZED: u64 = 100;
    const ENOT_OPERATOR: u64 = 101;
    const EINVALID_AMOUNT: u64 = 102;
    const EINVALID_SECRET: u64 = 103;
    const EINVALID_STATUS: u64 = 104;
    const ETIMEOUT_NOT_REACHED: u64 = 105;
    const EREQUEST_NOT_FOUND: u64 = 106;
    const EONLY_OPERATOR_CAN_CLAIM: u64 = 107;
    const EALREADY_REGISTERED: u64 = 108;
    const ENOT_REGISTERED: u64 = 109;
    const EINVALID_DESTINATION: u64 = 110;
    const ESELF_OPERATOR: u64 = 111;
    const EONLY_USER_CAN_REFUND: u64 = 112;
    const EINVALID_TIMEOUT: u64 = 113;

    // === Data Structures ===

    // Operator registry - admin manages whitelisted operators
    struct OperatorStore has key {
        admin: address,
        operators: Table<address, bool>
    }

    // HTLC Escrow lock - holds USDC until settlement is proven or timeout
    struct EscrowLock has store {
        request_id: u64,
        secret_hash: vector<u8>,       // sha3_256 hash of the secret
        secret: vector<u8>,            // revealed on claim (empty until claimed)
        timeout_at: u64,               // absolute timestamp for timeout
        operator: address,             // operator who created the escrow
        user: address,                 // user whose position was borrowed from
        token_id: u8,                  // loan token (USDC)
        amount: u64,                   // USDC amount locked
        market_id: u64,                // market where borrow happened
        destination_type: u8,          // 0=fiat, 1=cross_chain
        destination_info: vector<u8>,  // hashed bank details / chain address
        status: u8                     // 0=locked, 1=claimed, 2=refunded
    }

    // Global store for all escrow requests
    struct RequestStore has key {
        next_id: u64,
        escrows: Table<u64, EscrowLock>,
        user_escrows: Table<address, vector<u64>>
    }

    // === Events ===

    #[event]
    struct OperatorRegistered has drop, store {
        operator: address
    }

    #[event]
    struct OperatorDeregistered has drop, store {
        operator: address
    }

    #[event]
    struct WithdrawalCreated has drop, store {
        request_id: u64,
        user: address,
        operator: address,
        market_id: u64,
        amount: u64,
        destination_type: u8,
        timeout_at: u64
    }

    #[event]
    struct EscrowClaimed has drop, store {
        request_id: u64,
        operator: address,
        user: address,
        amount: u64
    }

    #[event]
    struct EscrowRefunded has drop, store {
        request_id: u64,
        user: address,
        operator: address,
        amount: u64
    }

    // === Constructor ===

    fun init_module(sender: &signer) {
        let sender_addr = signer::address_of(sender);

        move_to(sender, OperatorStore {
            admin: sender_addr,
            operators: table::new()
        });

        move_to(sender, RequestStore {
            next_id: 1,
            escrows: table::new(),
            user_escrows: table::new()
        });
    }

    // === Admin Functions ===

    // Register a new operator (admin only)
    public entry fun register_operator(admin: &signer, operator_addr: address) acquires OperatorStore {
        let store = borrow_global_mut<OperatorStore>(@weavelink);
        assert!(signer::address_of(admin) == store.admin, EUNAUTHORIZED);
        assert!(operator_addr != store.admin, ESELF_OPERATOR);
        assert!(!table::contains(&store.operators, operator_addr), EALREADY_REGISTERED);

        table::add(&mut store.operators, operator_addr, true);

        event::emit(OperatorRegistered { operator: operator_addr });
    }

    // Deregister an operator (admin only)
    public entry fun deregister_operator(admin: &signer, operator_addr: address) acquires OperatorStore {
        let store = borrow_global_mut<OperatorStore>(@weavelink);
        assert!(signer::address_of(admin) == store.admin, EUNAUTHORIZED);
        assert!(table::contains(&store.operators, operator_addr), ENOT_REGISTERED);

        table::remove(&mut store.operators, operator_addr);

        event::emit(OperatorDeregistered { operator: operator_addr });
    }

    // === Internal Helpers ===

    // Check if address is a registered operator
    fun is_operator(store: &OperatorStore, addr: address): bool {
        if (table::contains(&store.operators, addr)) {
            *table::borrow(&store.operators, addr)
        } else {
            false
        }
    }

    // === HTLC Functions ===

    // Create a withdrawal request with HTLC escrow
    //
    // This function:
    // 1. Borrows USDC from user's market position (requires user authorization via market_v1::set_authorization)
    // 2. Locks the USDC in an HTLC escrow
    //
    // The operator must be:
    // - Registered by admin
    // - Authorized by the user (via market_v1::set_authorization)
    //
    // The user must have:
    // - Sufficient collateral in the market
    // - A healthy position (health factor > 1 after borrow)
    public entry fun create_withdrawal(
        operator: &signer,
        user: address,
        market_id: u64,
        amount: u64,
        secret_hash: vector<u8>,
        timeout_at: u64,
        destination_type: u8,
        destination_info: vector<u8>
    ) acquires OperatorStore, RequestStore {
        assert!(amount > 0, EINVALID_AMOUNT);
        assert!(destination_type <= 1, EINVALID_DESTINATION);
        assert!(timeout_at > 0, EINVALID_TIMEOUT);

        let operator_addr = signer::address_of(operator);

        // Verify operator is registered
        let op_store = borrow_global<OperatorStore>(@weavelink);
        assert!(is_operator(op_store, operator_addr), ENOT_OPERATOR);

        // Borrow USDC from user's position (operator must be authorized by user)
        // This transfers USDC from market to operator
        market_v1::borrow(operator, user, market_id, amount);

        // Get loan token ID from market
        let (loan_token, _, _, _, _, _, _) = market_v1::get_market(market_id);

        // Lock USDC in escrow: transfer from operator to protocol address
        mock_tokens::transfer(operator, operator_addr, @weavelink, loan_token, amount);

        // Create escrow record
        let req_store = borrow_global_mut<RequestStore>(@weavelink);
        let request_id = req_store.next_id;
        req_store.next_id = req_store.next_id + 1;

        table::add(&mut req_store.escrows, request_id, EscrowLock {
            request_id,
            secret_hash,
            secret: vector::empty(),
            timeout_at,
            operator: operator_addr,
            user,
            token_id: loan_token,
            amount,
            market_id,
            destination_type,
            destination_info,
            status: STATUS_LOCKED
        });

        // Track escrows per user
        if (!table::contains(&req_store.user_escrows, user)) {
            table::add(&mut req_store.user_escrows, user, vector::empty());
        };
        let user_escrow_list = table::borrow_mut(&mut req_store.user_escrows, user);
        vector::push_back(user_escrow_list, request_id);

        event::emit(WithdrawalCreated {
            request_id,
            user,
            operator: operator_addr,
            market_id,
            amount,
            destination_type,
            timeout_at
        });
    }

    // Claim escrow - operator proves off-chain settlement by revealing the secret
    //
    // The secret must hash (sha3_256) to the secret_hash stored in the escrow.
    // On success, the locked USDC is released to the operator.
    // The secret is stored on-chain as proof of settlement (audit trail).
    public entry fun claim_escrow(
        operator: &signer,
        request_id: u64,
        secret: vector<u8>
    ) acquires RequestStore {
        let operator_addr = signer::address_of(operator);
        let req_store = borrow_global_mut<RequestStore>(@weavelink);

        assert!(table::contains(&req_store.escrows, request_id), EREQUEST_NOT_FOUND);
        let escrow = table::borrow_mut(&mut req_store.escrows, request_id);

        // Verify escrow is still locked
        assert!(escrow.status == STATUS_LOCKED, EINVALID_STATUS);

        // Verify caller is the operator who created this escrow
        assert!(escrow.operator == operator_addr, EONLY_OPERATOR_CAN_CLAIM);

        // Verify secret: sha3_256(secret) must equal stored hash
        let computed_hash = hash::sha3_256(copy secret);
        assert!(computed_hash == escrow.secret_hash, EINVALID_SECRET);

        // Store revealed secret for audit trail
        escrow.secret = secret;
        escrow.status = STATUS_CLAIMED;

        // Release USDC from escrow to operator
        let amount = escrow.amount;
        let token_id = escrow.token_id;

        mock_tokens::transfer(operator, @weavelink, operator_addr, token_id, amount);

        event::emit(EscrowClaimed {
            request_id,
            operator: operator_addr,
            user: escrow.user,
            amount
        });
    }

    // Refund escrow - after timeout, user claims the locked USDC
    //
    // Can only be called after the timeout has passed.
    // The USDC is returned to the user's wallet (not the market position).
    // The borrow debt remains in the market - user can repay manually.
    public entry fun refund_escrow(
        user: &signer,
        request_id: u64,
        current_time: u64
    ) acquires RequestStore {
        let user_addr = signer::address_of(user);
        let req_store = borrow_global_mut<RequestStore>(@weavelink);

        assert!(table::contains(&req_store.escrows, request_id), EREQUEST_NOT_FOUND);
        let escrow = table::borrow_mut(&mut req_store.escrows, request_id);

        // Verify escrow is still locked
        assert!(escrow.status == STATUS_LOCKED, EINVALID_STATUS);

        // Verify caller is the user
        assert!(escrow.user == user_addr, EONLY_USER_CAN_REFUND);

        // Verify timeout has been reached
        assert!(current_time >= escrow.timeout_at, ETIMEOUT_NOT_REACHED);

        escrow.status = STATUS_REFUNDED;

        // Return USDC to user's wallet
        let amount = escrow.amount;
        let token_id = escrow.token_id;

        mock_tokens::transfer(user, @weavelink, user_addr, token_id, amount);

        event::emit(EscrowRefunded {
            request_id,
            user: user_addr,
            operator: escrow.operator,
            amount
        });
    }

    // === View Functions ===

    // Check if an address is a registered operator
    #[view]
    public fun is_operator_registered(addr: address): bool acquires OperatorStore {
        if (!exists<OperatorStore>(@weavelink)) {
            return false
        };
        let store = borrow_global<OperatorStore>(@weavelink);
        is_operator(store, addr)
    }

    #[view]
    // Get escrow details by request ID
    // Returns: (request_id, operator, user, token_id, amount, destination_type, status)
    public fun get_escrow(request_id: u64): (u64, address, address, u8, u64, u8, u8) acquires RequestStore {
        if (!exists<RequestStore>(@weavelink)) {
            return (0, @0x0, @0x0, 0, 0, 0, 0)
        };
        let store = borrow_global<RequestStore>(@weavelink);
        if (!table::contains(&store.escrows, request_id)) {
            return (0, @0x0, @0x0, 0, 0, 0, 0)
        };
        let escrow = table::borrow(&store.escrows, request_id);
        (
            escrow.request_id,
            escrow.operator,
            escrow.user,
            escrow.token_id,
            escrow.amount,
            escrow.destination_type,
            escrow.status
        )
    }

    // Get number of escrows for a user
    #[view]
    public fun get_user_escrow_count(user: address): u64 acquires RequestStore {
        if (!exists<RequestStore>(@weavelink)) {
            return 0
        };
        let store = borrow_global<RequestStore>(@weavelink);
        if (!table::contains(&store.user_escrows, user)) {
            return 0
        };
        vector::length(table::borrow(&store.user_escrows, user))
    }

    // Get next request ID
    #[view]
    public fun get_next_request_id(): u64 acquires RequestStore {
        if (!exists<RequestStore>(@weavelink)) {
            return 1
        };
        borrow_global<RequestStore>(@weavelink).next_id
    }

    // Get destination type constant for fiat
    public fun destination_fiat(): u8 { DESTINATION_FIAT }

    // Get destination type constant for cross-chain
    public fun destination_cross_chain(): u8 { DESTINATION_CROSS_CHAIN }

    // Get status constant for locked
    public fun status_locked(): u8 { STATUS_LOCKED }

    // Get status constant for claimed
    public fun status_claimed(): u8 { STATUS_CLAIMED }

    // Get status constant for refunded
    public fun status_refunded(): u8 { STATUS_REFUNDED }

    // === Test Helpers ===

    #[test_only]
    public fun init_for_testing(deployer: &signer) {
        init_module(deployer)
    }

    // Helper to compute sha3_256 hash for testing
    #[test_only]
    public fun compute_secret_hash(secret: vector<u8>): vector<u8> {
        hash::sha3_256(secret)
    }
}