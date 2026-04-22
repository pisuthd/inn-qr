module blockforge::items {
    use std::signer;

    // === Data Structures ===

    /// A player's inventory holding shard and relic counts.
    struct Inventory has key {
        shards: u64,
        relics: u64,
    }

    // === Error Constants ===

    const ENOT_ENOUGH_SHARDS: u64 = 1;

    // === Entry Functions ===

    /// Initialize an empty inventory for the caller.
    public entry fun init_inventory(account: &signer) {
        move_to(account, Inventory { shards: 0, relics: 0 });
    }

    /// Mint one shard to the caller's inventory.
    public entry fun mint_shard(account: &signer) acquires Inventory {
        let addr = signer::address_of(account);
        if (!exists<Inventory>(addr)) {
            move_to(account, Inventory { shards: 0, relics: 0 });
        };
        let inv = borrow_global_mut<Inventory>(addr);
        inv.shards = inv.shards + 1;
    }

    /// Craft a relic by burning 2 shards.
    public entry fun craft_relic(account: &signer) acquires Inventory {
        let addr = signer::address_of(account);
        let inv = borrow_global_mut<Inventory>(addr);
        assert!(inv.shards >= 2, ENOT_ENOUGH_SHARDS);
        inv.shards = inv.shards - 2;
        inv.relics = inv.relics + 1;
    }

    // === View Functions ===

    #[view]
    /// Returns the (shards, relics) tuple for a given address.
    public fun get_inventory(addr: address): (u64, u64) acquires Inventory {
        if (!exists<Inventory>(addr)) {
            return (0, 0)
        };
        let inv = borrow_global<Inventory>(addr);
        (inv.shards, inv.relics)
    }

    // === Tests ===

    #[test(account = @0x1)]
    /// Test that minting shards increments the count correctly.
    fun test_mint_shard(account: &signer) acquires Inventory {
        init_inventory(account);
        mint_shard(account);
        mint_shard(account);
        let (shards, relics) = get_inventory(@0x1);
        assert!(shards == 2);
        assert!(relics == 0);
    }

    #[test(account = @0x1)]
    /// Test that crafting a relic burns 2 shards and adds 1 relic.
    fun test_craft_relic(account: &signer) acquires Inventory {
        init_inventory(account);
        mint_shard(account);
        mint_shard(account);
        craft_relic(account);
        let (shards, relics) = get_inventory(@0x1);
        assert!(shards == 0);
        assert!(relics == 1);
    }

    #[test(account = @0x1)]
    /// Test that minting without prior init_inventory auto-creates the inventory.
    fun test_mint_without_init(account: &signer) acquires Inventory {
        mint_shard(account);
        let (shards, relics) = get_inventory(@0x1);
        assert!(shards == 1);
        assert!(relics == 0);
    }

    #[test(account = @0x1)]
    #[expected_failure(abort_code = 1, location = blockforge::items)]
    /// Test that crafting fails when not enough shards.
    fun test_craft_relic_insufficient_shards(account: &signer) acquires Inventory {
        init_inventory(account);
        mint_shard(account);
        craft_relic(account);
    }

    #[test(account = @0x1)]
    /// Test that get_inventory returns (0, 0) for an address without an inventory.
    fun test_get_inventory_empty() acquires Inventory {
        let (shards, relics) = get_inventory(@0x99);
        assert!(shards == 0);
        assert!(relics == 0);
    }

    #[test(account = @0x1)]
    /// Test a full game loop: mint 5 shards, craft 2 relics, verify final state.
    fun test_full_game_loop(account: &signer) acquires Inventory {
        init_inventory(account);
        mint_shard(account);
        mint_shard(account);
        mint_shard(account);
        mint_shard(account);
        mint_shard(account);
        craft_relic(account);
        craft_relic(account);
        let (shards, relics) = get_inventory(@0x1);
        assert!(shards == 1);
        assert!(relics == 2);
    }
}
