/// @title WeaveLink Market -- Isolated Lending Pool
/// @notice A Morpho Blue-inspired isolated lending market where each market pairs a
///         single loan token with a single collateral token 
module weavelink::market {

    use std::signer;
    use std::table::{Self, Table};
    use initia_std::event;

    use weavelink::mock_tokens;
    use weavelink::price_oracle;

    // =========================================================================
    //  Constants
    // =========================================================================

    /// Scale factor for the health-factor view function (1.0 is represented as 100).
    const HEALTH_SCALE: u64 = 100;

    /// Seconds in a 365-day year, used to annualise the per-second borrow rate.
    const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;

    // =========================================================================
    //  Error Codes
    // =========================================================================

    /// The supplied amount is zero or otherwise invalid.
    const EINVALID_AMOUNT: u64 = 1;
    /// The market does not have enough un-borrowed liquidity.
    const EINSUFFICIENT_LIQUIDITY: u64 = 2;
    /// The user does not have enough tokens / collateral for the operation.
    const EINSUFFICIENT_COLLATERAL: u64 = 3;
    /// The position's health factor would drop below 1 after the action.
    const EHEALTH_FACTOR_BELOW_ONE: u64 = 4;
    /// The requested market_id does not exist.
    const EMARKET_NOT_FOUND: u64 = 5;
    /// The caller is not the contract owner.
    const EUNAUTHORIZED: u64 = 6;
    /// The user has no position in the given market.
    const EPOSITION_NOT_FOUND: u64 = 7;
    /// The caller is not authorized to act on behalf of the target user.
    const ENOT_AUTHORIZED: u64 = 8;
    /// A user attempted to authorize themselves (delegator == delegate).
    const ESAME_ADDRESS: u64 = 9;

    // =========================================================================
    //  Data Structures
    // =========================================================================

    /// An isolated lending market pairing one loan token with one collateral token.
    /// Each market is uniquely identified by an auto-incremented `market_id`.
    struct Market has key, store {
        market_id: u64,           /// Auto-incremented unique identifier (1, 2, 3 ...)
        loan_token: u8,           /// Token ID of the asset that can be supplied & borrowed
        collateral_token: u8,     /// Token ID of the asset accepted as collateral

        /// Maximum liquidation loan-to-value (e.g. 80 means 80 %).
        /// A position is unhealthy when (borrowed_value / collateral_value) > LLTV.
        lltv: u64,

        // -- Interest-rate model parameters (all annualised, scaled by 1e6) --

        base_rate: u64,           /// Borrow rate at 0 % utilization
        slope: u64,               /// Rate slope between 0 % and `kink` utilization
        kink: u64,                /// Utilization % at which the jump rate begins
        jump_rate: u64,           /// Additional rate slope above `kink`

        // -- Aggregate pool state --

        total_supply: u64,        /// Total loan tokens supplied by all users
        total_borrow: u64,        /// Total loan tokens currently borrowed
        total_collateral: u64,    /// Total collateral tokens deposited
        last_update: u64,         /// Unix timestamp (seconds) of last interest accrual
    }

    /// A user's position within a single market.
    struct Position has key, store {
        supplied: u64,            /// Loan tokens the user has supplied
        borrowed: u64,            /// Loan tokens the user has borrowed
        collateral: u64           /// Collateral tokens the user has deposited
    }

    /// Stores per-user authorization maps: delegator -> (delegate -> is_authorized).
    struct AuthorizationStore has key {
        authorizations: Table<address, Table<address, bool>>,
    }

    /// Global singleton that owns all markets, positions, and the owner address.
    struct MarketStore has key {
        next_market_id: u64,                                    /// Next market_id to assign
        markets: Table<u64, Market>,                            /// market_id -> Market
        positions: Table<address, Table<u64, Position>>,        /// user -> (market_id -> Position)
        owner: address                                          /// Address permitted to create markets
    }

    // =========================================================================
    //  Events
    // =========================================================================

    /// Emitted when a new isolated market is created by the contract owner.
    #[event]
    struct MarketCreated has drop, store {
        market_id: u64,           /// Assigned market identifier
        loan_token: u8,           /// Token ID of the loan asset
        collateral_token: u8,     /// Token ID of the collateral asset
        lltv: u64                 /// Liquidation LTV (e.g. 80 = 80 %)
    }

    /// Emitted when loan tokens are supplied to a market.
    #[event]
    struct Supply has drop, store {
        caller: address,          /// Address that sent the tokens
        on_behalf: address,       /// Address whose position is credited
        market_id: u64,           /// Target market
        amount: u64               /// Number of loan tokens supplied
    }

    /// Emitted when supplied loan tokens are withdrawn from a market.
    #[event]
    struct Withdraw has drop, store {
        caller: address,          /// Address initiating the withdrawal
        receiver: address,        /// Address receiving the tokens
        market_id: u64,           /// Source market
        amount: u64               /// Number of loan tokens withdrawn
    }

    /// Emitted when loan tokens are borrowed against collateral.
    #[event]
    struct Borrow has drop, store {
        caller: address,          /// Address receiving the borrowed tokens
        on_behalf: address,       /// Address whose position is debited
        market_id: u64,           /// Source market
        amount: u64               /// Number of loan tokens borrowed
    }

    /// Emitted when borrowed tokens are repaid.
    #[event]
    struct Repay has drop, store {
        caller: address,          /// Address sending the repayment
        on_behalf: address,       /// Address whose debt is reduced
        market_id: u64,           /// Target market
        amount: u64               /// Number of loan tokens repaid (capped at debt)
    }

    /// Emitted when collateral tokens are deposited into a market.
    #[event]
    struct SupplyCollateral has drop, store {
        caller: address,          /// Address that sent the collateral
        on_behalf: address,       /// Address whose position is credited
        market_id: u64,           /// Target market
        amount: u64               /// Number of collateral tokens deposited
    }

    /// Emitted when collateral tokens are withdrawn from a market.
    #[event]
    struct WithdrawCollateral has drop, store {
        caller: address,          /// Address initiating the withdrawal
        receiver: address,        /// Address receiving the collateral
        market_id: u64,           /// Source market
        amount: u64               /// Number of collateral tokens withdrawn
    }

    /// Emitted when a position is liquidated.
    #[event]
    struct Liquidate has drop, store {
        liquidator: address,      /// Address performing the liquidation
        borrower: address,        /// Address of the unhealthy borrower
        market_id: u64,           /// Market in which liquidation occurred
        repaid: u64,              /// Debt repaid by the liquidator
        seized: u64               /// Collateral seized from the borrower
    }

    /// Emitted when a user grants or revokes delegate authorization.
    #[event]
    struct AuthorizationUpdated has drop, store {
        delegator: address,       /// User who is delegating (or revoking) permission
        delegate: address,        /// Address being authorized (or de-authorized)
        authorized: bool          /// `true` to grant, `false` to revoke
    }

    // =========================================================================
    //  Internal Helpers
    // =========================================================================

    /// Calculate the current annualised borrow rate for a market using the
    /// piecewise-linear ("jump") interest-rate model.
    ///
    /// Returns a rate scaled by 1e6:
    ///   - 0% utilization -> base_rate
    ///   - 0%-kink%       -> linear interpolation from base_rate to base_rate + slope
    ///   - > kink%         -> base_rate + slope + jump_rate * (util - kink) / (100 - kink)
    fun calculate_borrow_rate(market: &Market): u64 {
        if (market.total_supply == 0) {
            return market.base_rate
        };

        let utilization = market.total_borrow * 100 / market.total_supply;

        if (utilization <= market.kink) {
            market.base_rate + (market.slope * utilization / market.kink)
        } else {
            let normal_rate = market.base_rate + market.slope;
            let excess = utilization - market.kink;
            let max_excess = 100 - market.kink;
            normal_rate + (market.jump_rate * excess / max_excess)
        }
    }

    // Accrue interest on a market
    fun accrue_interest(market: &mut Market, current_time: u64) {
        if (market.last_update == 0) {
            market.last_update = current_time;
            return
        };

        if (current_time <= market.last_update) {
            return
        };

        let time_elapsed = current_time - market.last_update;
        
        if (time_elapsed == 0 || market.total_borrow == 0) {
            market.last_update = current_time;
            return
        };

        // Calculate interest: borrow * rate * time / seconds_per_year
        // rate is already scaled by 1e6
        let rate = calculate_borrow_rate(market);
        let interest = market.total_borrow * rate * time_elapsed / SECONDS_PER_YEAR / 1000000;
        
        if (interest > 0) {
            market.total_borrow = market.total_borrow + interest;
        };
        
        market.last_update = current_time;
    }

    // === Constructor ===

    // Initialize the market store 
    fun init_module(sender: &signer) {
        let sender_addr = signer::address_of(sender);
        
        move_to(sender, MarketStore {
            next_market_id: 1,
            markets: table::new(),
            positions: table::new(),
            owner: sender_addr
        });

        move_to(sender, AuthorizationStore {
            authorizations: table::new(),
        });

    }

    // === Authorization Functions ===

    // Set authorization for a delegate to act on behalf
    public entry fun set_authorization(
        delegator: &signer,
        delegate: address,
        authorized: bool
    ) acquires AuthorizationStore {
        assert!(signer::address_of(delegator) != delegate, ESAME_ADDRESS);
        
        let store = borrow_global_mut<AuthorizationStore>(@weavelink);
        let delegator_addr = signer::address_of(delegator);

        if (!table::contains(&store.authorizations, delegator_addr)) {
            table::add(&mut store.authorizations, delegator_addr, table::new<address, bool>());
        };

        let delegator_auths = table::borrow_mut(&mut store.authorizations, delegator_addr);
        table::upsert(delegator_auths, delegate, authorized);

        event::emit(AuthorizationUpdated {
            delegator: delegator_addr,
            delegate,
            authorized
        });
    }

    // Check if a delegate is authorized to act on behalf of a user
    fun is_authorized(store: &AuthorizationStore, delegator: address, delegate: address): bool {
        if (!table::contains(&store.authorizations, delegator)) {
            return false
        };
        let delegator_auths = table::borrow(&store.authorizations, delegator);
        if (!table::contains(delegator_auths, delegate)) {
            return false
        };
        *table::borrow(delegator_auths, delegate)
    }

    // === Owner Functions ===

    // Create a new market - returns the new market_id
    public entry fun create_market(
        owner: &signer,
        loan_token: u8,
        collateral_token: u8,
        lltv: u64,
        base_rate: u64,
        slope: u64,
        kink: u64,
        jump_rate: u64
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@weavelink);
        assert!(signer::address_of(owner) == store.owner, EUNAUTHORIZED);
        assert!(lltv <= 100, EINVALID_AMOUNT);
        assert!(loan_token != collateral_token, EINVALID_AMOUNT);

        let market_id = store.next_market_id;
        store.next_market_id = store.next_market_id + 1;

        table::add(&mut store.markets, market_id, Market {
            market_id,
            loan_token,
            collateral_token,
            lltv,
            base_rate,
            slope,
            kink,
            jump_rate,
            total_supply: 0,
            total_borrow: 0,
            total_collateral: 0,
            last_update: 0,
        });

        event::emit(MarketCreated {
            market_id,
            loan_token,
            collateral_token,
            lltv
        });
    }

    // === Supply Functions ===

    // Supply loan tokens to a specific market
    public entry fun supply(
        account: &signer,
        on_behalf: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore, AuthorizationStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Check authorization if caller != on_behalf
        if (caller != on_behalf) {
            let auth_store = borrow_global<AuthorizationStore>(@weavelink);
            assert!(is_authorized(auth_store, on_behalf, caller), ENOT_AUTHORIZED);
        };

        // Get market
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let loan_token = market.loan_token;

        // Check balance
        let balance = mock_tokens::balance_of(caller, loan_token);
        assert!(balance >= amount, EINSUFFICIENT_COLLATERAL);

        // Transfer tokens from caller
        mock_tokens::transfer(account, caller, @weavelink, loan_token, amount);

        // Update position for on_behalf
        let position = get_or_create_position(store, on_behalf, market_id);
        position.supplied = position.supplied + amount;

        // Update market totals
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_supply = market_mut.total_supply + amount;

        event::emit(Supply {
            caller,
            on_behalf,
            market_id,
            amount
        });
    }

    // Withdraw supplied tokens from a specific market
    public entry fun withdraw(
        account: &signer,
        receiver: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Get market for token
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let loan_token = market.loan_token;

        // Get position
        assert!(table::contains(&store.positions, caller), EPOSITION_NOT_FOUND);
        let user_positions = table::borrow_mut(&mut store.positions, caller);
        assert!(table::contains(user_positions, market_id), EPOSITION_NOT_FOUND);
        let position = table::borrow_mut(user_positions, market_id);
        
        assert!(position.supplied >= amount, EINSUFFICIENT_COLLATERAL);

        // Update position
        position.supplied = position.supplied - amount;

        // Update market
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        assert!(market_mut.total_supply >= amount, EINSUFFICIENT_LIQUIDITY);
        market_mut.total_supply = market_mut.total_supply - amount;

        // Transfer tokens to receiver
        mock_tokens::transfer(account, @weavelink, receiver, loan_token, amount);

        event::emit(Withdraw {
            caller,
            receiver,
            market_id,
            amount
        });
    }

    // === Borrow Functions ===

    // Borrow loan tokens against collateral from a specific market
    public entry fun borrow(
        account: &signer,
        on_behalf: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore, AuthorizationStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Check authorization if caller != on_behalf
        if (caller != on_behalf) {
            let auth_store = borrow_global<AuthorizationStore>(@weavelink);
            assert!(is_authorized(auth_store, on_behalf, caller), ENOT_AUTHORIZED);
        };

        // Get market
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let loan_token = market.loan_token;

        // Check liquidity
        assert!(market.total_supply >= market.total_borrow + amount, EINSUFFICIENT_LIQUIDITY);

        // Check health factor for on_behalf
        assert!(check_health_factor(store, market_id, on_behalf, amount, 0), EHEALTH_FACTOR_BELOW_ONE);

        // Update position for on_behalf
        let position = get_or_create_position(store, on_behalf, market_id);
        position.borrowed = position.borrowed + amount;

        // Update market
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_borrow = market_mut.total_borrow + amount;

        // Transfer tokens to caller
        mock_tokens::transfer(account, @weavelink, caller, loan_token, amount);

        event::emit(Borrow {
            caller,
            on_behalf,
            market_id,
            amount
        });
    }

    // Repay borrowed tokens to a specific market
    public entry fun repay(
        account: &signer,
        on_behalf: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Get market for token
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let loan_token = market.loan_token;

        // Check balance
        let balance = mock_tokens::balance_of(caller, loan_token);
        assert!(balance >= amount, EINSUFFICIENT_COLLATERAL);

        // Transfer tokens from caller
        mock_tokens::transfer(account, caller, @weavelink, loan_token, amount);

        // Get position for on_behalf
        assert!(table::contains(&store.positions, on_behalf), EPOSITION_NOT_FOUND);
        let user_positions = table::borrow_mut(&mut store.positions, on_behalf);
        assert!(table::contains(user_positions, market_id), EPOSITION_NOT_FOUND);
        let position = table::borrow_mut(user_positions, market_id);
        
        // Cap repayment at borrowed amount
        let repay_amount = if (position.borrowed >= amount) { amount } else { position.borrowed };

        // Update position
        position.borrowed = position.borrowed - repay_amount;

        // Update market
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_borrow = market_mut.total_borrow - repay_amount;

        event::emit(Repay {
            caller,
            on_behalf,
            market_id,
            amount: repay_amount
        });
    }

    // === Collateral Functions ===

    // Supply collateral to a specific market
    public entry fun supply_collateral(
        account: &signer,
        on_behalf: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore, AuthorizationStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Check authorization if caller != on_behalf
        if (caller != on_behalf) {
            let auth_store = borrow_global<AuthorizationStore>(@weavelink);
            assert!(is_authorized(auth_store, on_behalf, caller), ENOT_AUTHORIZED);
        };

        // Get market for collateral token
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let collateral_token = market.collateral_token;

        // Check balance
        let balance = mock_tokens::balance_of(caller, collateral_token);
        assert!(balance >= amount, EINSUFFICIENT_COLLATERAL);

        // Transfer collateral tokens from caller
        mock_tokens::transfer(account, caller, @weavelink, collateral_token, amount);

        // Update position for on_behalf
        let position = get_or_create_position(store, on_behalf, market_id);
        position.collateral = position.collateral + amount;

        // Update market totals (in collateral tokens)
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_collateral = market_mut.total_collateral + amount;

        event::emit(SupplyCollateral {
            caller,
            on_behalf,
            market_id,
            amount
        });
    }

    // Withdraw collateral from a specific market (must maintain health factor)
    public entry fun withdraw_collateral(
        account: &signer,
        receiver: address,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, EINVALID_AMOUNT);

        let caller = signer::address_of(account);
        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Get market for collateral token
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let collateral_token = market.collateral_token;

        // Get position
        assert!(table::contains(&store.positions, caller), EPOSITION_NOT_FOUND);
        let user_positions = table::borrow_mut(&mut store.positions, caller);
        assert!(table::contains(user_positions, market_id), EPOSITION_NOT_FOUND);
        let position = table::borrow_mut(user_positions, market_id);
        
        assert!(position.collateral >= amount, EINSUFFICIENT_COLLATERAL);

        // Store current collateral and calculate new collateral
        let current_collateral = position.collateral;
        let new_collateral = current_collateral - amount;

        // Drop the mutable borrows before health check
        let _ = position;
        let _ = user_positions;

        // Check health factor AFTER hypothetical withdrawal (pass negative collateral delta)
        assert!(check_health_factor(store, market_id, caller, 0, amount), EHEALTH_FACTOR_BELOW_ONE);

        // Re-acquire position and update
        let user_positions = table::borrow_mut(&mut store.positions, caller);
        let position = table::borrow_mut(user_positions, market_id);
        position.collateral = new_collateral;

        // Update market
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_collateral = market_mut.total_collateral - amount;

        // Transfer tokens to receiver
        mock_tokens::transfer(account, @weavelink, receiver, collateral_token, amount);

        event::emit(WithdrawCollateral {
            caller,
            receiver,
            market_id,
            amount
        });
    }

    // === Health Check ===

    // Check if position is healthy after additional borrow and/or collateral withdrawal
    // additional_borrow: extra borrow amount (for borrow operations)
    // collateral_withdraw: collateral being removed (for withdraw_collateral operations)
    fun check_health_factor(
        store: &MarketStore,
        market_id: u64,
        borrower: address,
        additional_borrow: u64,
        collateral_withdraw: u64
    ): bool {
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        
        if (!table::contains(&store.positions, borrower)) {
            return true
        };
        
        let user_positions = table::borrow(&store.positions, borrower);
        if (!table::contains(user_positions, market_id)) {
            return true
        };

        let position = table::borrow(user_positions, market_id);
        let total_borrowed = position.borrowed + additional_borrow;
        let effective_collateral = position.collateral - collateral_withdraw;
        
        if (total_borrowed == 0) {
            return true
        };

        // Get prices from oracle
        let loan_price = price_oracle::get_oracle_price(market.loan_token);
        let collateral_price = price_oracle::get_oracle_price(market.collateral_token);
        
        // Calculate values
        let borrowed_value = total_borrowed * loan_price;
        let max_borrow_value = effective_collateral * collateral_price * market.lltv / 100;

        max_borrow_value >= borrowed_value
    }

    // === Liquidation ===

    // Liquidate unhealthy positions in a specific market
    public entry fun liquidate(
        liquidator: &signer,
        borrower: address,
        market_id: u64,
        max_repay: u64
    ) acquires MarketStore {
        assert!(max_repay > 0, EINVALID_AMOUNT);

        let store = borrow_global_mut<MarketStore>(@weavelink);

        // Get market for tokens
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);
        let market = table::borrow(&store.markets, market_id);
        let loan_token = market.loan_token;
        let collateral_token = market.collateral_token;

        // Check position exists
        assert!(table::contains(&store.positions, borrower), EPOSITION_NOT_FOUND);
        let borrower_positions = table::borrow_mut(&mut store.positions, borrower);
        assert!(table::contains(borrower_positions, market_id), EPOSITION_NOT_FOUND);
        let position = table::borrow_mut(borrower_positions, market_id);

        // Store position values
        let current_borrowed = position.borrowed;
        let current_collateral = position.collateral;

        // Drop the mutable borrow before health check
        let _ = position;
        let _ = borrower_positions;

        // Check if unhealthy (health check with no additional borrow/withdrawal)
        assert!(!check_health_factor(store, market_id, borrower, 0, 0), EHEALTH_FACTOR_BELOW_ONE);

        let repay_amount = if (current_borrowed > max_repay) { max_repay } else { current_borrowed };

        // Check liquidator balance
        let liquidator_addr = signer::address_of(liquidator);
        let balance = mock_tokens::balance_of(liquidator_addr, loan_token);
        assert!(balance >= repay_amount, EINSUFFICIENT_COLLATERAL);

        // Liquidator repays debt
        mock_tokens::transfer(liquidator, liquidator_addr, @weavelink, loan_token, repay_amount);

        // Calculate seized collateral (1:1 for simplicity)
        let seized_amount = if (current_collateral >= repay_amount) { repay_amount } else { current_collateral };

        // Re-acquire position and update
        let borrower_positions = table::borrow_mut(&mut store.positions, borrower);
        let position = table::borrow_mut(borrower_positions, market_id);
        position.borrowed = current_borrowed - repay_amount;
        position.collateral = current_collateral - seized_amount;

        // Update market
        let market_mut = table::borrow_mut(&mut store.markets, market_id);
        market_mut.total_borrow = market_mut.total_borrow - repay_amount;
        market_mut.total_collateral = market_mut.total_collateral - seized_amount;

        // Transfer seized collateral to liquidator
        mock_tokens::transfer(liquidator, @weavelink, liquidator_addr, collateral_token, seized_amount);

        event::emit(Liquidate {
            liquidator: liquidator_addr,
            borrower,
            market_id,
            repaid: repay_amount,
            seized: seized_amount
        });
    }

    // === View Functions ===

    // Get or create position helper
    fun get_or_create_position(
        store: &mut MarketStore,
        user: address,
        market_id: u64
    ): &mut Position {
        assert!(table::contains(&store.markets, market_id), EMARKET_NOT_FOUND);

        if (!table::contains(&store.positions, user)) {
            table::add(&mut store.positions, user, table::new<u64, Position>());
        };

        let user_positions = table::borrow_mut(&mut store.positions, user);
        
        if (!table::contains(user_positions, market_id)) {
            table::add(user_positions, market_id, Position {
                supplied: 0,
                borrowed: 0,
                collateral: 0
            });
        };

        table::borrow_mut(user_positions, market_id)
    }

    // Get user's position in a market
    #[view]
    public fun get_position(user: address, market_id: u64): (u64, u64, u64) acquires MarketStore {
        if (!exists<MarketStore>(@weavelink)) {
            return (0, 0, 0)
        };

        let store = borrow_global<MarketStore>(@weavelink);
        
        if (!table::contains(&store.positions, user)) {
            return (0, 0, 0)
        };

        let user_positions = table::borrow(&store.positions, user);
        if (!table::contains(user_positions, market_id)) {
            return (0, 0, 0)
        };

        let position = table::borrow(user_positions, market_id);
        (position.supplied, position.borrowed, position.collateral)
    }

    // Get market info
    #[view]
    public fun get_market(market_id: u64): (u8, u8, u64, u64, u64, u64, u64) acquires MarketStore {
        if (!exists<MarketStore>(@weavelink)) {
            return (0, 0, 0, 0, 0, 0, 0)
        };

        let store = borrow_global<MarketStore>(@weavelink);
        if (!table::contains(&store.markets, market_id)) {
            return (0, 0, 0, 0, 0, 0, 0)
        };

        let market = table::borrow(&store.markets, market_id);
        (
            market.loan_token,
            market.collateral_token,
            market.total_supply,
            market.total_borrow,
            market.total_collateral,
            market.lltv,
            calculate_borrow_rate(market)
        )
    }

    // Calculate health factor
    #[view]
    public fun get_health_factor(user: address, market_id: u64): u64 acquires MarketStore {
        if (!exists<MarketStore>(@weavelink)) {
            return 0
        };

        let store = borrow_global<MarketStore>(@weavelink);
        
        if (!table::contains(&store.markets, market_id)) {
            return 0
        };

        let market = table::borrow(&store.markets, market_id);

        if (!table::contains(&store.positions, user)) {
            return HEALTH_SCALE
        };

        let user_positions = table::borrow(&store.positions, user);
        if (!table::contains(user_positions, market_id)) {
            return HEALTH_SCALE
        };

        let position = table::borrow(user_positions, market_id);
        
        if (position.borrowed == 0) {
            return HEALTH_SCALE
        };

        let loan_price = price_oracle::get_oracle_price(market.loan_token);
        let collateral_price = price_oracle::get_oracle_price(market.collateral_token);
        
        if (loan_price == 0 || collateral_price == 0) {
            return 0
        };

        let borrowed_value = position.borrowed * loan_price;
        let max_borrow_value = position.collateral * collateral_price * market.lltv / 100;

        if (borrowed_value == 0) {
            return HEALTH_SCALE
        };

        max_borrow_value * HEALTH_SCALE / borrowed_value
    }

    // Get next market ID
    #[view]
    public fun get_next_market_id(): u64 acquires MarketStore {
        if (!exists<MarketStore>(@weavelink)) {
            return 1
        };
        let store = borrow_global<MarketStore>(@weavelink);
        store.next_market_id
    }

    // Check if delegate is authorized
    #[view]
    public fun is_delegate_authorized(delegator: address, delegate: address): bool acquires AuthorizationStore {
        if (!exists<AuthorizationStore>(@weavelink)) {
            return false
        };
        let store = borrow_global<AuthorizationStore>(@weavelink);
        is_authorized(store, delegator, delegate)
    }

    // === Test Helpers ===

    #[test_only]
    public fun init_module_for_testing(deployer: &signer) {
        init_module(deployer);
        mock_tokens::init_for_testing(deployer)
    }

    #[test_only]
    public fun get_registry_address(): address {
        @weavelink
    }
}