# WeaveLink

## What WeaveLink Is

Across Initia Interwoven, crypto holders earn yield from staking, lending, and LP positions -- sINIT at ~12%, Cabal iUSD at ~17%, various LP positions yielding 20%+ -- but that yield sits locked in positions across dozens of appchains. To spend it, you'd have to sell. Selling triggers taxable events, breaks compounding, and disrupts your strategy.

WeaveLink lets you spend your yield without selling. You keep your collateral. You keep your position. Your earned yield becomes spendable in local currency through existing national QR payment rails.

The flow is simple: scan a merchant QR code, the operator borrows USDC against your lending position, locks it in a Hash Time-Locked Contract (HTLC) escrow on-chain, settles the fiat payment off-chain, then cryptographically proves settlement to claim the USDC. If the operator fails, you get your USDC back. No trust required.

```
Traditional crypto spending          WeaveLink
---------------------------          ----------------------------
Sell crypto -> taxable event  ->     Borrow against collateral (no sale)
Use centralized exchange     ->      HTLC escrow (non-custodial)
Wait for bank transfer       ->      Settled via national QR rails
Trust the exchange           ->      Cryptographic proof (SHA3-256)
```

---

## Live Endpoints

Our appchain is deployed on AWS EC2 with a reverse proxy, distributed via CloudFront with HTTPS. Anyone can interact with the live dapp and chain directly -- no local setup or custom client required.

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend URL | `https://d3pgy5i52ev547.cloudfront.net` | Live dapp connected to weavelink-1 chain |
| Rollup RPC | `https://d3pgy5i52ev547.cloudfront.net/rpc` | Transaction broadcast, block queries |
| Rollup REST | `https://d3pgy5i52ev547.cloudfront.net/rest` | REST API, contract view functions |
| Operator API | `https://weavelink-one.vercel.app/api` | Match, confirm, approve endpoints |
| Faucet Script | `scripts/faucet.js` | For mint gas tokens |

---

## Initia Hackathon Submission

- **Project Name**: WeaveLink

### Project Overview

Spend yield from staked assets across Initia Interwoven via QR in local currency, with HTLC-secured, trustless settlement built on isolated lending markets. Designed for crypto holders who earn yield across multiple appchains but need to spend without selling.

### Implementation Detail

- **The Custom Implementation**: Isolated lending markets with HTLC escrow for trustless, operator-mediated USDC withdrawals. Inspired by [Morpho Blue](https://github.com/morpho-org/morpho-blue)'s design.
  - Isolated markets: one loan token (USDC) with one collateral token to minimize risk, plus supply, borrow, collateral, repay, liquidation, and per-second interest accrual
  - Delegation-based authorization system allowing operators to borrow on behalf of users
  - HTLC escrow module that locks USDC for operator-mediated off-ramp fiat payments, with SHA3-256 for cryptographic settlement proof, timeout safety, and on-chain audit trail

- **The Native Features**:
  - **Auto-signing**: Users grant a single scoped session before initiating payments. All subsequent on-chain actions -- authorizing the operator, confirming escrow -- execute as background transactions with zero wallet interruption. The payment experience is indistinguishable from a traditional mobile banking app.
  - **IBC Interwoven Bridge**: The Wallet page uses InterwovenKit's `openBridge()` to enable asset transfers from Initia L1 (initiation-2) and Cabal directly to weavelink-1, without leaving the app or opening external bridge interfaces.

- **Stateless Operator Backend**: A Node.js Express server acting as the operator. No database. All state lives on-chain. The backend holds operator keys, constructs and broadcasts transactions via `@initia/initia.js`, and handles FX conversion across Southeast Asian payment rails.

### How to Run

**1. Access the dapp**
Open https://d3pgy5i52ev547.cloudfront.net in your browser. Connect using any Web3 wallet (Metamask, Rabby, etc.) -- InterwovenKit handles chain integration seamlessly.

**2. Get gas tokens**
Clone the repo, then run:
```bash
cd scripts
npm install
node faucet.js YOUR_ADDRESS
```
This mints gas tokens to your address so you can pay for on-chain transactions.

**3. Get mock tokens**
Navigate to the Wallet page and mint mock interest-bearing tokens (sINIT, LP, iUSD). These simulate yield from staking and LP positions across Initia Interwoven.

**4. Deposit collateral**
Track your APY earnings on interest-bearing tokens. When ready, click the Deposit icon on the main menu to supply collateral to isolated lending markets. Note: Collateral tokens do not accrue interest -- only the loan token (USDC) positions earn yield.

**5. Borrow USDC**
After depositing collateral, you gain borrowing power and the USDC will be used for off-ramping into local currency.

**6. Scan or enter payment**
Click the Scan icon to scan a merchant QR code (for now we need to use the manual entry form with Thailand's PromptPay system). Click Next -- the system matches you with a local operator.

**7. Approve operator**
Once matched, the operator provides a quote in USDC with FX fees. If this is your first transaction, you'll need to approve the operator to borrow on your behalf and move funds from your lending position into the HTLC escrow.

**8. Provide memo and confirm**
Enter a memo. This memo is hashed on the client side, and the operator uses this hash to lock USDC into the HTLC escrow. Funds remain locked until you review and approve the settlement.

**9. Verify and unlock**
The operator settles the fiat payment off-chain (e.g., bank transfer to merchant). You review the payment slip and reveal the full memo. This cryptographic proof unlocks the escrow, transferring USDC to the operator. If the operator fails to settle within the timeout (typically ~30 minutes), you can manually trigger a refund to reclaim your USDC.

When a user makes a payment, they're not actually spending their collateral -- instead, they borrow USDC from their own lending position. This borrowed USDC is locked in the HTLC escrow and released to the operator after off-chain settlement. The user then repays the borrowed USDC plus interest. This interest accrues to liquidity providers (LPs) who supply USDC to the markets, and incentivizes operators to act as LPs themselves to facilitate the off-chain settlement flow.

---

## Architecture Overview

WeaveLink is built from three tightly integrated layers:

```
+--------------------------------------------------------------+
|                      weavelink-frontend                       |
|                   React + Vite + InterwovenKit               |
|                                                               |
|  +---------------+  +---------------+  +------------------+  |
|  |  ScanPay      |  |  Wallet       |  |  Receipts        |  |
|  |  QR Scanner   |  |  Token Mgmt   |  |  Escrow Status   |  |
|  |  Payment Flow |  |  Bridge       |  |  Claim / Refund  |  |
|  +---------------+  +---------------+  +------------------+  |
|                                                               |
|  +---------------+  +---------------+  +------------------+  |
|  |  Deposit      |  |  Borrow       |  |  Earn / Repay    |  |
|  |  Supply       |  |  Withdraw     |  |  Market Actions  |  |
|  +---------------+  +---------------+  +------------------+  |
|                                                               |
|       InterwovenKit -- auto-signing / bridge / wallet         |
+----------------------------+----------------------------------+
                             |  REST API
+----------------------------v----------------------------------+
|                    weavelink-backend                          |
|                 Node.js + Express (Operator)                  |
|                                                               |
|  +---------------+  +---------------+  +------------------+  |
|  | /api/match    |  | /api/confirm  |  | /api/approve     |  |
|  | Quote + Auth  |  | Create Escrow |  | Claim Escrow     |  |
|  | FX + Fee Calc |  | HTLC Secret   |  | Settlement Proof |  |
|  +---------------+  +---------------+  +------------------+  |
|                                                               |
|  +---------------+  +---------------+                         |
|  | fx.js         |  | blockchain.js |                         |
|  | 5 QR Rails    |  | initia.js SDK |                         |
|  | FX / Fees     |  | View + Execute|                         |
|  +---------------+  +---------------+                         |
+----------------------------+----------------------------------+
                             |  MsgExecute / viewFunction
+----------------------------v----------------------------------+
|                  weavelink-contract (MoveVM)                  |
|               Sovereign Minitia L2 -- weavelink-1             |
|                                                               |
|  +-------------+  +-------------+  +---------+  +---------+  |
|  | market_v1   |  | operator    |  | oracle  |  | mocks   |  |
|  |             |  |             |  |         |  |         |  |
|  | Isolated    |  | HTLC Escrow |  | Price   |  | Test    |  |
|  | Lending     |  | Registry    |  | Feeds   |  | Tokens  |  |
|  | Supply      |  | Withdrawal  |  | 1e6     |  | Multi   |  |
|  | Borrow      |  | Claim       |  | Prec.   |  | Asset   |  |
|  | Collateral  |  | Refund      |  |         |  |         |  |
|  +-------------+  +-------------+  +---------+  +---------+  |
+----------------------------+----------------------------------+
                             |  OPinit Optimistic Rollup
+----------------------------v----------------------------------+
|                 Initia L1 -- initiation-2                     |
|      Security / Finality / Fraud Proofs / Shared Liquidity    |
+--------------------------------------------------------------+
```

---

## How It Works

### Payment Flow Lifecycle

```
User                      Frontend                  Backend                   Chain (weavelink-1)
----                      -------                   -------                   -------------------
  |                          |                         |                           |
  |  Scan merchant QR        |                         |                           |
  |------------------------->|                         |                           |
  |                          |                         |                           |
  |                          |  POST /api/match        |                           |
  |                          |  (rail, amount, user)   |                           |
  |                          |------------------------>|                           |
  |                          |                         |  viewFunction:            |
  |                          |                         |  is_authorized?           |
  |                          |                         |  get_position             |
  |                          |                         |  get_health_factor        |
  |                          |                         |-------------------------->|
  |                          |                         |<--------------------------|
  |                          |                         |                           |
  |                          |  operator + quote +     |                           |
  |                          |  authorization status   |                           |
  |                          |<------------------------|                           |
  |                          |                         |                           |
  |  [Authorize operator     |                         |                           |
  |   if needed]             |                         |                           |
  |------------------------->|                         |                           |
  |                          |  MsgExecute:            |                           |
  |                          |  set_authorization      |                           |
  |                          |------------------------------------------------------->|
  |                          |                         |                           |
  |  Confirm payment         |                         |                           |
  |------------------------->|                         |                           |
  |                          |  POST /api/confirm      |                           |
  |                          |  (memo, same params)    |                           |
  |                          |------------------------>|                           |
  |                          |                         |  MsgExecute:              |
  |                          |                         |  create_withdrawal        |
  |                          |                         |  (borrow + HTLC lock)     |
  |                          |                         |-------------------------->|
  |                          |                         |<--------------------------|
  |                          |                         |                           |
  |                          |  receipt + requestId    |                           |
  |                          |  + escrow status        |                           |
  |                          |<------------------------|                           |
  |                          |                         |                           |
  |  Receipt shown           |                         |                           |
  |<-------------------------|                         |                           |
  |                          |                         |                           |
  |  ... operator settles off-chain (fiat transfer) ...   |                     |
  |                          |                         |                           |
  |  POST /api/approve       |                         |                           |
  |  (requestId, memo)       |                         |                           |
  |------------------------->|                         |                           |
  |                          |------------------------>|                           |
  |                          |                         |  MsgExecute:              |
  |                          |                         |  claim_escrow(secret)     |
  |                          |                         |-------------------------->|
  |                          |                         |<--------------------------|
  |                          |  settlement confirmed   |                           |
  |                          |<------------------------|                           |
  |<-------------------------|                         |                           |
```

### HTLC Escrow Mechanics

The escrow uses a double-hash scheme for stateless secret management:

```
1. User provides a memo (4-8 alphanumeric chars)
2. secret = sha3-256(memo)
3. secret_hash = sha3-256(secret)
4. secret_hash is stored on-chain in the EscrowLock
5. secret is revealed during claim_escrow to prove settlement
6. If timeout (30 min) -- user calls refund_escrow, gets USDC back
```

The operator never holds user funds. USDC is locked in the protocol address (`@weavelink`) until the secret is proven or timeout expires.

---

## Core Components

### Move Contracts -- The Settlement Engine

Four Move modules running on weavelink-1 handle all financial logic:

**market_v1.move** -- Isolated lending markets inspired by Morpho Blue. Each market has a unique (loan_token, collateral_token) pair. Interest accrues per-second using a jump-rate model. Health factor checks guard every borrow and withdrawal.

| Function | Description |
|----------|-------------|
| `create_market(owner, ...)` | Create new isolated market |
| `supply(account, on_behalf, market_id, amount)` | Supply loan tokens |
| `withdraw(account, receiver, market_id, amount)` | Withdraw supplied tokens |
| `supply_collateral(account, on_behalf, market_id, amount)` | Deposit collateral |
| `withdraw_collateral(account, receiver, market_id, amount)` | Withdraw collateral (health check) |
| `borrow(account, on_behalf, market_id, amount)` | Borrow against collateral |
| `repay(account, on_behalf, market_id, amount)` | Repay borrowed tokens |
| `liquidate(liquidator, borrower, market_id, max_repay)` | Liquidate unhealthy positions |
| `set_authorization(delegator, delegate, authorized)` | Delegate borrow authority |
| `is_delegate_authorized(delegator, delegate)` | Check delegation |

**operator.move** -- Operator registry and HTLC escrow for mediated withdrawals. Operators borrow USDC from user positions (with authorization), lock it in escrow, settle off-chain, then prove settlement with SHA3-256.

| Function | Description |
|----------|-------------|
| `register_operator(admin, operator_addr)` | Whitelist operator (admin only) |
| `create_withdrawal(operator, user, market_id, amount, secret_hash, ...)` | Borrow + lock in HTLC |
| `claim_escrow(operator, request_id, secret)` | Prove settlement, receive USDC |
| `refund_escrow(user, request_id, current_time)` | Timeout refund to user |
| `is_operator_registered(addr)` | Check operator status |
| `get_escrow(request_id)` | View escrow details |
| `get_user_escrow_count(user)` | Count user escrows |

**oracle.move** -- Admin-managed price feeds with 1e6 precision.

**mock_tokens.move** -- Multi-token mock for testing (USDC, sINIT, LP, iUSD, Delta Neutral).

### Backend API -- The Operator Service

A stateless Express.js server that acts as the operator. No database -- all state lives on-chain. The server holds operator keys, constructs transactions, and broadcasts them via `@initia/initia.js`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | GET | API info, operator address, supported rails |
| `/api/setup` | GET | Health check: operator registration, funding status |
| `/api/register` | POST | Register operator on-chain (one-time admin action) |
| `/api/match` | POST | Quote + authorization check + matching delay |
| `/api/confirm` | POST | Create HTLC escrow on-chain, return receipt |
| `/api/approve` | POST | Claim escrow with settlement proof |
| `/api/receipts/:userAddress` | GET | List all escrow receipts for a user |

**FX Service** (`fx.js`) handles:

| Rail | Currency | FX Rate | Country |
|------|----------|---------|---------|
| PromptPay | THB | 35.0 | Thailand |
| VietQR | VND | 25,000 | Vietnam |
| DuitNow | MYR | 4.7 | Malaysia |
| QRIS | IDR | 15,500 | Indonesia |
| PayNow | SGD | 1.35 | Singapore |

Fee: 0.5% on the USDC amount, applied at conversion time.

### Frontend -- The User Interface

React + Vite application with InterwovenKit for wallet, auto-signing, and IBC bridge:

| Page | Description |
|------|-------------|
| Home | Portfolio overview, total yield, APY, quick actions |
| ScanPay | QR scanner + manual entry, full payment flow (match -> authorize -> confirm) |
| Wallet | Token balances grouped by source chain (Initia L1 / Cabal), bridge buttons |
| Receipts | Escrow history, claim/refund actions, settlement status |
| Deposit | Supply tokens to lending markets |
| Borrow | Borrow USDC against collateral |
| Repay | Repay outstanding debt |
| Earn | View and enter yield strategies |
| FAQ | Common questions |

**Auto-Signing** -- InterwovenKit sessions enable background transaction signing. Users approve a single session grant, and all subsequent moves (authorize, borrow, escrow) execute without wallet popups.

**Bridge** -- Native IBC bridge from Initia L1 and Cabal to weavelink-1, integrated directly in the Wallet page via InterwovenKit's `openBridge()`.

---

## Feature Set

| Feature | Description |
|---------|-------------|
| Isolated Lending Markets | Each market is independent with unique token pairs. Inspired by Morpho Blue. |
| HTLC Escrow Settlement | Operator cannot access USDC until settlement is cryptographically proven (SHA3-256 double-hash). |
| 5 National QR Rails | PromptPay (THB), VietQR (VND), DuitNow (MYR), QRIS (IDR), PayNow (SGD). |
| Operator-Mediated Withdrawals | Operators borrow on behalf of users, settle fiat off-chain, prove on-chain. |
| Timeout Safety | 30-minute escrow timeout. User reclaims USDC if operator fails to settle. |
| Health Factor Guards | All borrows checked against collateral ratio. Liquidation for unhealthy positions. |
| Stateless Backend | No database. All state on-chain. Operator keys + initia.js SDK only. |
| Enshrined Auto-Signing | One session approval via InterwovenKit. Scoped, time-limited, revocable. |
| Interwoven Bridge | Bridge assets from Initia L1 and Cabal directly within the frontend. |
| FX Conversion | Real-time local-to-USDC conversion with 0.5% fee across 5 currencies. |
| Jump Rate Interest | Per-second interest accrual with kink-based rate model. |
| Full Test Coverage | 98 Move tests covering market, auth, interest, liquidation, and operator flows. |

---

## Repository Structure

```
weavelink/
├── contracts/
│   ├── Move.toml
│   └── sources/
│       ├── market_v1.move              # Isolated lending with supply/borrow/collateral/liquidation
│       ├── oracle.move                 # Admin-managed price feeds (1e6 precision)
│       ├── operator.move               # Operator registry + HTLC escrow
│       ├── mocks/
│       │   └── mock_tokens.move        # Multi-token mock (USDC, sINIT, LP, iUSD, DNIUSD)
│       └── tests/
│           ├── test_market.move        # Market CRUD, supply, withdraw, borrow, repay (18 tests)
│           ├── test_authorization.move # Delegate auth, on-behalf operations (9 tests)
│           ├── test_interest.move      # Rate calculations, kink model (7 tests)
│           ├── test_liquidation.move   # Full/partial liquidation, health (7 tests)
│           └── test_operator.move      # HTLC escrow, claim, refund, timeouts (37 tests)
│
├── backend/
│   ├── package.json
│   ├── server.js                       # Express API: match, confirm, approve, receipts
│   └── services/
│       ├── blockchain.js               # initia.js SDK: view functions, MsgExecute, wallets
│       └── fx.js                       # FX rates, fee calculation, HTLC secret derivation
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                     # Route definitions
│       ├── config.js                   # Chain config, tokens, InterwovenKit setup
│       ├── main.jsx
│       ├── index.css
│       ├── components/
│       │   ├── BottomNav.jsx           # Tab navigation
│       │   ├── Header.jsx              # App header
│       │   └── Modal.jsx               # Reusable modal wrapper
│       ├── contexts/
│       │   └── SettingsContext.jsx      # Country/currency selection
│       └── pages/
│           ├── Home.jsx                # Portfolio overview, yield display
│           ├── ScanPay.jsx             # QR scan + payment flow (match/auth/confirm)
│           ├── Wallet.jsx              # Token balances, bridge buttons
│           ├── Receipts.jsx            # Escrow history, claim/refund
│           ├── Deposit.jsx             # Supply to markets
│           ├── Borrow.jsx              # Borrow against collateral
│           ├── Repay.jsx               # Repay debt
│           ├── Earn.jsx                # Yield strategies
│           ├── Dashboard.jsx           # Analytics
│           ├── Portfolio.jsx           # Position details
│           ├── Withdraw.jsx            # Withdraw from markets
│           └── Faq.jsx                 # FAQ page
│
└── scripts/
    ├── package.json
    ├── faucet.js                       # Mint test tokens to any address
    ├── check-balance.js                # Query on-chain balances
    └── admin-balance.js                # Admin utility
```

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Smart Contracts | Move (MoveVM) | Lending markets, HTLC escrow, oracle, operator registry |
| L2 Rollup | Initia OPinit Stack | Sovereign appchain weavelink-1, fraud proofs |
| L1 Security | Initia initiation-2 | Finality, shared liquidity, settlement |
| Backend | Node.js + Express | Operator API: matching, escrow creation, settlement |
| JS SDK | @initia/initia.js | Transaction construction, signing, broadcast, view functions |
| Frontend | React + Vite | UI, payment flow, wallet management |
| Wallet & Sessions | @initia/interwovenkit-react | Auto-signing, IBC bridge, wallet connection |
| Cross-chain | IBC + OPinit | L1 to L2 asset movement |
| Crypto | SHA3-256 (double-hash) | HTLC secret/hash for trustless escrow |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Start the backend

```bash
cd backend
npm install
node server.js
```

The server starts on `http://localhost:3001`. On first run, check operator status:

```bash
curl http://localhost:3001/api/setup
```

If the operator is not registered, register it:

```bash
curl -X POST http://localhost:3001/api/register
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown in terminal (typically `http://localhost:5173`).

### 3. Get test tokens

```bash
cd scripts
npm install
node faucet.js YOUR_INIT_ADDRESS
```

This mints USDC, sINIT, LP, iUSD, and Delta Neutral INIT tokens to your address.

### 4. Make a payment

1. Open the frontend, connect your wallet
2. Deposit collateral and supply USDC in a market
3. Tap "Scan" to open the payment flow
4. Enter merchant details (or scan QR), amount, and memo
5. The system matches an operator, shows a quote
6. Authorize the operator (one-time on-chain transaction)
7. Confirm -- USDC is locked in HTLC escrow
8. Operator settles fiat payment off-chain
9. Approve -- operator proves settlement, claims USDC

---



## Backend API Reference

### POST /api/match

Quote and authorization check. Simulates operator matching with a small delay.

**Request:**

```json
{
  "userAddress": "init1...",
  "rail": "promptpay",
  "proxyType": "phone",
  "proxyValue": "+66812345678",
  "currency": "THB",
  "amount": 100,
  "marketId": 1
}
```

**Response:**

```json
{
  "status": "matched",
  "operator": { "address": "init1...", "name": "WeaveLink Operator", "country": "Thailand" },
  "quote": {
    "localAmount": 100,
    "currency": "THB",
    "fxRate": 35.0,
    "usdcAmount": 2.86,
    "fee": { "rate": "0.5%", "usdc": 0.014286 },
    "totalUsdc": 2.87
  },
  "authorization": { "needsAuthorization": true, "isAuthorized": false },
  "position": { "supplied": 100000000, "borrowed": 0, "collateral": 50000000, "healthFactor": 250 }
}
```

### POST /api/confirm

Create HTLC escrow on-chain. Borrows USDC from user position and locks in escrow.

**Request:**

```json
{
  "userAddress": "init1...",
  "rail": "promptpay",
  "proxyType": "phone",
  "proxyValue": "+66812345678",
  "currency": "THB",
  "amount": 100,
  "marketId": 1,
  "memo": "abc1234"
}
```

**Response:**

```json
{
  "status": "escrow_created",
  "requestId": 1,
  "txHash": "ABCD1234...",
  "timeoutAt": 1745500000,
  "timeoutMinutes": 30,
  "memoHash": "a1b2c3d4...",
  "receipt": { "requestId": 1, "usdcAmount": "2.87", "localAmount": 100, "currency": "THB" }
}
```

### POST /api/approve

Claim escrow after off-chain settlement. Reveals the HTLC secret to prove the operator completed the fiat transfer.

**Request:**

```json
{
  "requestId": 1,
  "memo": "abc1234"
}
```

**Response:**

```json
{
  "status": "claimed",
  "requestId": 1,
  "txHash": "EFGH5678...",
  "escrow": { "amount": 2870000, "previousStatus": "locked", "newStatus": "claimed" }
}
```

### GET /api/receipts/:userAddress

List all escrow receipts for a user.

**Response:**

```json
{
  "receipts": [
    { "requestId": 1, "amount": 2870000, "status": "claimed", "destinationType": 0 },
    { "requestId": 2, "amount": 1500000, "status": "locked", "destinationType": 0 }
  ]
}
```

---

## Contract Module Reference

### Interest Rate Model (market_v1.move)

Jump rate with per-second accrual, scaled by 1e6:

```
if utilization <= kink:
    rate = base_rate + slope * utilization / kink
else:
    rate = base_rate + slope + jump_rate * (utilization - kink) / (100 - kink)
```

### Health Factor (market_v1.move)

```
health_factor = (collateral * collateral_price * lltv / 100) * 100 / (borrowed * loan_price)
```

- `health_factor >= 100` -- position is healthy
- `health_factor < 100` -- position can be liquidated

### Escrow States (operator.move)

| Status | Code | Description |
|--------|------|-------------|
| Locked | 0 | USDC locked, waiting for claim or refund |
| Claimed | 1 | Operator proved settlement, received USDC |
| Refunded | 2 | Timeout expired, user reclaimed USDC |

### Destination Types (operator.move)

| Type | Code | Description |
|------|------|-------------|
| Fiat | 0 | Bank transfer / QR payment |
| Cross-chain | 1 | Bridge transfer |

## System Overview

WeaveLink combines on-chain financial primitives, a stateless operator service, and a mobile-first frontend. All critical state stays on-chain while execution and real-world settlement are delegated to the off-chain operator layer.

- **Smart Contracts (MoveVM on weavelink-1)** -- Implements isolated lending markets and HTLC escrow. Handles collateral, borrowing, authorization, escrow locking, claim, and refund logic -- all financial guarantees enforced on-chain.
- **Operator Backend (Node.js + Express)** -- Stateless service for payment matching, FX calculation, and transaction execution. Borrows USDC on behalf of users, locks in HTLC escrow, performs off-chain settlement, and completes the flow by submitting the secret for on-chain claim.
- **Frontend (React + InterwovenKit, Mobile-First)** -- Mobile-first payment interface with QR scanning, integrated wallet, auto-signing sessions, and bridge access.

Future improvements may include Privy integration for better mobile onboarding. The current wallet experience is limited by SDK support on mobile environments.

## Conclusion

WeaveLink bridges DeFi yield and real-world spending by turning passive on-chain positions into active payment rails. By combining isolated lending markets with HTLC-secured operator settlement, the system removes the need to sell assets, preserving capital efficiency while enabling everyday usability.

Built on Initia Interwoven, WeaveLink demonstrates how sovereign appchains can tightly integrate financial primitives and user experience. The result is a trustless, composable system where yield becomes liquid in the real world -- unlocking a new category of crypto-native payments.

## License

MIT
