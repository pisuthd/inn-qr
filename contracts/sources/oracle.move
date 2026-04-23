/// @title Price Oracle
/// @notice Simple price oracle for token prices
/// @dev Prices are stored with 1e6 precision ($1 = 1000000)
module weavelink::price_oracle {

    use initia_std::event;
    use std::signer;
    use std::table::{Self, Table};

    // === Constants ===

    // Default price when not set ($1)
    const DEFAULT_PRICE: u64 = 1000000;

    // === Errors ===

    const EUNAUTHORIZED: u64 = 1;
    const EINVALID_PRICE: u64 = 2;
    const ENO_PRICE: u64 = 3;

    // === Data Structures ===

    // Price oracle storing prices for tokens (scaled by 1e6)
    struct PriceOracle has key {
        prices: Table<u8, u64>,  // token_id -> price in USD (price * 1e6)
        last_update: u64,
        owner: address
    }

    // === Events ===

    #[event]
    struct PriceUpdated has drop, store {
        token: u8,
        price: u64
    }

    // === Helper Functions ===

    // Get oracle price (default to 1e6 = $1)
    public fun get_price(oracle: &PriceOracle, token: u8): u64 {
        if (table::contains(&oracle.prices, token)) {
            *table::borrow(&oracle.prices, token)
        } else {
            DEFAULT_PRICE
        }
    }

    // Set oracle price (internal)
    fun set_price_internal(oracle: &mut PriceOracle, token: u8, price: u64) {
        assert!(price > 0, EINVALID_PRICE);
        table::upsert(&mut oracle.prices, token, price);
        oracle.last_update = oracle.last_update + 1;
    }

    // === Constructor ===

    // Initialize the oracle  
    fun init_oracle(sender: &signer) {
        let sender_addr = signer::address_of(sender);
        
        move_to(sender, PriceOracle {
            prices: table::new(),
            last_update: 0,
            owner: sender_addr
        });
    }

    // === Admin Functions ===

    // Set price for a token (admin function)
    public entry fun set_price(
        owner: &signer,
        token: u8,
        price: u64  // Price in USD, scaled by 1e6
    ) acquires PriceOracle {
        let oracle = borrow_global_mut<PriceOracle>(@weavelink);
        assert!(signer::address_of(owner) == oracle.owner, EUNAUTHORIZED);
        assert!(price > 0, EINVALID_PRICE);

        set_price_internal(oracle, token, price);

        event::emit(PriceUpdated {
            token,
            price
        });
    }

    // === View Functions ===

    // Get oracle price
    #[view]
    public fun get_oracle_price(token: u8): u64 acquires PriceOracle {
        if (!exists<PriceOracle>(@weavelink)) {
            return DEFAULT_PRICE
        };
        let oracle = borrow_global<PriceOracle>(@weavelink);
        get_price(oracle, token)
    }

    // Get last update timestamp
    #[view]
    public fun get_last_update(): u64 acquires PriceOracle {
        if (!exists<PriceOracle>(@weavelink)) {
            return 0
        };
        let oracle = borrow_global<PriceOracle>(@weavelink);
        oracle.last_update
    }

    // === Test Helpers ===

    #[test_only]
    public fun init_for_testing(deployer: &signer) {
        init_oracle(deployer)
    }

    #[test_only]
    public fun get_oracle_address(): address {
        @weavelink
    }
}