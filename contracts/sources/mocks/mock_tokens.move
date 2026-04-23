/// Mock Token System for testing.
/// Supports USDC, S_INIT, S_LP, CABAL_IUSD, CABAL_DNIUSD

module weavelink::mock_tokens {

    use std::error;
    use std::option;
    use std::table::{Self, Table};
    use initia_std::event;

    // === Constants ===

    // Token IDs
    const USDC: u8 = 0;
    const S_INIT: u8 = 1;
    const S_LP: u8 = 2;
    const CABAL_IUSD: u8 = 3;
    const CABAL_DNIUSD: u8 = 4;
    const NUM_TOKENS: u8 = 5;

    // Error codes
    const EINSUFFICIENT_BALANCE: u64 = 1;
    const ETOKEN_NOT_FOUND: u64 = 2;
    const EREGISTRY_NOT_INITIALIZED: u64 = 3;

    // === Data Structures ===

    // Global registry holding all user balances.
    // Maps address -> Table<token_id, balance>
    struct Registry has key {
        balances: Table<address, Table<u8, u64>>,
        initialized: bool
    }

    // Event emitted when tokens are minted
    #[event]
    struct MintEvent has drop, store {
        recipient: address,
        token_id: u8,
        amount: u64
    }

    // Event emitted when tokens are burned
    #[event]
    struct BurnEvent has drop, store {
        from: address,
        token_id: u8,
        amount: u64
    }

    // Event emitted when tokens are transferred
    #[event]
    struct TransferEvent has drop, store {
        from: address,
        to: address,
        token_id: u8,
        amount: u64
    }

    // === Errors ===

    fun assert_registry_initialized() acquires Registry {
        assert!(exists<Registry>(@weavelink), error::not_found(EREGISTRY_NOT_INITIALIZED));
        let registry = borrow_global<Registry>(@weavelink);
        assert!(registry.initialized, error::invalid_state(EREGISTRY_NOT_INITIALIZED));
    }

    fun assert_token_valid(token_id: u8) {
        assert!(token_id < NUM_TOKENS, error::invalid_argument(ETOKEN_NOT_FOUND));
    }

    // === Constructor ===

    // Initialize the registry
    fun init_module(sender: &signer) {
        // Only allow initialization from the module's address
        if (!exists<Registry>(@weavelink)) {
            move_to(sender, Registry {
                balances: table::new(),
                initialized: true
            });
        }
    }

    // === Helper Functions ===

    // Initialize or get user's balance entry
    fun get_or_create_user_balances(
        registry: &mut Registry,
        user: address
    ): &mut Table<u8, u64> {
        if (!table::contains(&registry.balances, user)) {
            table::add(&mut registry.balances, user, table::new<u8, u64>());
        };
        table::borrow_mut(&mut registry.balances, user)
    }

    // Get balance, returns 0 if not found
    fun get_balance(balances: &Table<u8, u64>, token_id: u8): u64 {
        if (table::contains(balances, token_id)) {
            *table::borrow(balances, token_id)
        } else {
            0
        }
    }

    // === Entry Functions ===

    // Mint tokens to any recipient. Anyone can call this.
    public entry fun mint(
        _account: &signer,
        recipient: address,
        token_id: u8,
        amount: u64
    ) acquires Registry {
        assert_token_valid(token_id);
        let registry = borrow_global_mut<Registry>(@weavelink);
        
        let balances = get_or_create_user_balances(registry, recipient);
        
        let current_balance = get_balance(balances, token_id);
        let new_balance = current_balance + amount;
        
        // Upsert the balance
        table::upsert(balances, token_id, new_balance);
        
        event::emit(MintEvent {
            recipient,
            token_id,
            amount
        });
    }

    // Burn tokens from any holder. Anyone can call this.
    public entry fun burn(
        _account: &signer,
        from: address,
        token_id: u8,
        amount: u64
    ) acquires Registry {
        assert_token_valid(token_id);
        let registry = borrow_global_mut<Registry>(@weavelink);
        
        assert!(table::contains(&registry.balances, from), error::not_found(EINSUFFICIENT_BALANCE));
        let balances = table::borrow_mut(&mut registry.balances, from);
        
        let current_balance = get_balance(balances, token_id);
        assert!(current_balance >= amount, error::invalid_argument(EINSUFFICIENT_BALANCE));
        
        let new_balance = current_balance - amount;
        
        if (new_balance == 0) {
            // Remove the entry if balance is 0
            table::remove(balances, token_id);
        } else {
            table::upsert(balances, token_id, new_balance);
        };
        
        event::emit(BurnEvent {
            from,
            token_id,
            amount
        });
    }

    // Transfer tokens between addresses. Anyone can call this.
    public entry fun transfer(
        _account: &signer,
        from: address,
        to: address,
        token_id: u8,
        amount: u64
    ) acquires Registry {
        assert_token_valid(token_id);
        let registry = borrow_global_mut<Registry>(@weavelink);
        
        // Check from has enough balance
        assert!(table::contains(&registry.balances, from), error::not_found(EINSUFFICIENT_BALANCE));
        let from_balances = table::borrow_mut(&mut registry.balances, from);
        
        let current_balance = get_balance(from_balances, token_id);
        assert!(current_balance >= amount, error::invalid_argument(EINSUFFICIENT_BALANCE));
        
        // Deduct from sender
        let new_from_balance = current_balance - amount;
        if (new_from_balance == 0) {
            table::remove(from_balances, token_id);
        } else {
            table::upsert(from_balances, token_id, new_from_balance);
        };
        
        // Add to recipient
        let to_balances = get_or_create_user_balances(registry, to);
        let to_balance = get_balance(to_balances, token_id);
        table::upsert(to_balances, token_id, to_balance + amount);
        
        event::emit(TransferEvent {
            from,
            to,
            token_id,
            amount
        });
    }

    // === View Functions ===

    // Returns the balance of a given address for a given token_id.
    #[view]
    public fun balance_of(addr: address, token_id: u8): u64 acquires Registry {
        assert_token_valid(token_id);
        
        if (!exists<Registry>(@weavelink)) {
            return 0
        };
        
        let registry = borrow_global<Registry>(@weavelink);
        
        if (!table::contains(&registry.balances, addr)) {
            return 0
        };
        
        let balances = table::borrow(&registry.balances, addr);
        get_balance(balances, token_id)
    }

    // Returns the total supply of a token (sum of all balances).
    #[view]
    public fun total_supply(token_id: u8): u64 acquires Registry {
        assert_token_valid(token_id);
        
        if (!exists<Registry>(@weavelink)) {
            return 0
        };
        
        let registry = borrow_global<Registry>(@weavelink);
        let iter = table::iter(&registry.balances, option::none(), option::none(), 1);
        
        let total: u64 = 0;
        while (table::prepare(iter)) {
            let (_, user_balances) = table::next(iter);
            total = total + get_balance(user_balances, token_id);
        };
        
        total
    }

    // === Test Helpers ===

    #[test_only]
    public fun init_for_testing(deployer: &signer) {
        init_module(deployer)
    }

    #[test_only]
    public fun get_registry_address(): address {
        @weavelink
    }

    // === Constants Getters ===

    #[view]
    public fun usdc_id(): u8 { USDC }

    #[view]
    public fun s_init_id(): u8 { S_INIT }

    #[view]
    public fun s_lp_id(): u8 { S_LP }

    #[view]
    public fun cabal_iusd_id(): u8 { CABAL_IUSD }

    #[view]
    public fun cabal_dniusd_id(): u8 { CABAL_DNIUSD }

    // === Tests ===

    #[test(account = @weavelink)]
    fun test_init(account: &signer) {
        init_module(account);
        assert!(exists<Registry>(@weavelink), 0);
    }

    #[test(account = @weavelink)]
    fun test_mint(account: &signer) acquires Registry {
        init_module(account);
        
        let user = @0x123;
        mint(account, user, USDC, 1000);
        mint(account, user, S_INIT, 500);
        
        assert!(balance_of(user, USDC) == 1000, 1);
        assert!(balance_of(user, S_INIT) == 500, 2);
    }

    #[test(account = @weavelink)]
    fun test_burn(account: &signer) acquires Registry {
        init_module(account);
        
        let user = @0x123;
        mint(account, user, USDC, 1000);
        burn(account, user, USDC, 300);
        
        assert!(balance_of(user, USDC) == 700, 1);
    }

    #[test(account = @weavelink)]
    fun test_transfer(account: &signer) acquires Registry {
        init_module(account);
        
        let user1 = @0x123;
        let user2 = @0x456;
        
        mint(account, user1, USDC, 1000);
        transfer(account, user1, user2, USDC, 400);
        
        assert!(balance_of(user1, USDC) == 600, 1);
        assert!(balance_of(user2, USDC) == 400, 2);
    }

    #[test(account = @weavelink)]
    fun test_multiple_tokens(account: &signer) acquires Registry {
        init_module(account);
        
        let user = @0x123;
        
        // Mint all token types
        mint(account, user, USDC, 100);
        mint(account, user, S_INIT, 200);
        mint(account, user, S_LP, 300);
        mint(account, user, CABAL_IUSD, 400);
        mint(account, user, CABAL_DNIUSD, 500);
        
        assert!(balance_of(user, USDC) == 100, 1);
        assert!(balance_of(user, S_INIT) == 200, 2);
        assert!(balance_of(user, S_LP) == 300, 3);
        assert!(balance_of(user, CABAL_IUSD) == 400, 4);
        assert!(balance_of(user, CABAL_DNIUSD) == 500, 5);
    }

    #[test(account = @weavelink)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_burn_insufficient_balance(account: &signer) acquires Registry {
        init_module(account);
        
        let user = @0x123;
        mint(account, user, USDC, 100);
        burn(account, user, USDC, 200); // Should fail
    }

    #[test(account = @weavelink)]
    #[expected_failure(abort_code = 0x10001)]
    fun test_transfer_insufficient_balance(account: &signer) acquires Registry {
        init_module(account);
        
        let user1 = @0x123;
        let user2 = @0x456;
        
        mint(account, user1, USDC, 100);
        transfer(account, user1, user2, USDC, 200); // Should fail
    }
}