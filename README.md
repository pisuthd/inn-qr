# WeaveLink

**WeaveLink** enables spending yield from staked assets across Initia Interwoven via QR in local currency across SEA, using HTLC escrow to ensure trustless settlement between operators and merchants. The system is built on isolated lending markets, allowing users to borrow against ibToken-based positions while maintaining capital efficiency.

## What WeaveLink Is

Across Initia Interwoven, crypto holders earn yield from staking, lending, and LP positions -- sINIT at ~12%, Cabal iUSD at ~17%, various LP positions yielding 20%+ -- but that yield sits locked in positions across dozens of appchains. To spend it, you'd have to sell. Selling triggers taxable events, breaks compounding, and disrupts your strategy.

WeaveLink lets you spend your yield without selling. You keep your collateral. You keep your position. Your earned yield becomes spendable in local currency through existing national QR payment rails.

The flow is simple: scan a merchant QR code, the operator borrows USDC against your lending position, locks it in a Hash Time-Locked Contract (HTLC) escrow on-chain, settles the fiat payment off-chain, then cryptographically proves settlement to claim the USDC. If the operator fails, you get your USDC back. No trust required.

<img width="1187" height="548" alt="Screenshot from 2026-04-25 19-00-11" src="https://github.com/user-attachments/assets/cffbb63f-aec5-480b-a133-da2a9095e8ea" />

---

## Live Endpoints

Our appchain is deployed on AWS EC2 with a reverse proxy, distributed via CloudFront with HTTPS. Anyone can interact with the live dapp and chain directly -- no local setup required.

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

When a user makes a payment, they're not actually spending their collateral -- instead, they borrow USDC from their own lending position. This borrowed USDC is locked in the HTLC escrow and released to the operator after off-chain settlement. 

The user then repays the borrowed USDC plus interest. This interest accrues to liquidity providers (LPs) who supply USDC to the markets, and incentivizes operators to act as LPs themselves to facilitate the off-chain settlement flow.

---

## System Overview

<img width="742" height="620" alt="Screenshot from 2026-04-25 21-40-13" src="https://github.com/user-attachments/assets/6680c257-12c7-482e-ba19-3115bd2294d5" />

WeaveLink is designed as a 3-layer system where all critical state and guarantees live on-chain, while execution and real-world settlement are handled by an operator layer. The architecture ensures that funds are never custodial and safety does not depend on trust.

- **Smart Contracts (MoveVM)** -- `market.move` implements isolated lending markets where each market pairs a single loan token (USDC) with a single collateral token (ibToken), keeping risk fully contained per market. `operator.move` implements HTLC escrow: USDC is locked on-chain using a hash derived from the user’s memo, and can only be claimed with the correct secret or refunded after a 30-minute timeout. All financial guarantees — collateralization, health factor checks, delegated borrowing, escrow claim, and refund — are enforced entirely on-chain.
- **Operator Backend (Node.js + Express)** -- A stateless service with no database and no custody of user funds. Handles FX quoting across Southeast Asian QR rails, constructs `create_withdrawal` transactions to borrow USDC on behalf of users and lock it into escrow, performs off-chain settlement, and submits `claim_escrow` once the secret is revealed.
- **Frontend (React + InterwovenKit, Mobile-First)** -- A mobile-first interface designed to match real-world payment behavior, including QR scanning and streamlined flows. Integrates wallet, auto-signing sessions, and IBC bridging via `openBridge()`. With auto-signing, users approve once and subsequent transactions execute in the background without repeated wallet prompts.

If the operator fails to complete settlement within the timeout window, the protocol allows users to reclaim their USDC directly from escrow — no operator involvement required. The system is safe by default, not by trust.

Looking forward, the current mobile wallet experience is constrained by SDK support. Future iterations may integrate email-based onboarding (e.g., Privy) to provide a smoother, mobile-native user experience while maintaining the same underlying architecture.

## Architecture Overview

## How It Works

### Payment Flow Lifecycle

<img width="1121" height="883" alt="Screenshot from 2026-04-25 21-47-36" src="https://github.com/user-attachments/assets/54be6670-b3a2-4a2b-947c-4745705d8a32" />

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

### Move Contracts

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

**oracle.move** -- Admin-managed price feeds.

**mock_tokens.move** -- Mock tokens for testing (USDC, sINIT, LP, Cabal iUSD, Cabal Delta Neutral).

### Backend API

A stateless Express.js server that acts as the operator. No database -- all state lives on-chain. The server holds operator keys, constructs transactions, and broadcasts them via `@initia/initia.js`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | GET | API info, operator address, supported rails |
| `/api/match` | POST | Quote + authorization check + matching |
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

---

## Repository Structure

```
weavelink/
├── contracts/
│   ├── market_v1.move      # Isolated lending markets (supply, borrow, collateral)
│   ├── operator.move       # HTLC escrow + operator-mediated withdrawals
│   └── oracle.move         # Price feeds (1e6 precision)
│
├── backend/
│   ├── server.js           # Operator API (match, confirm, approve)
│   └── services/
│       ├── blockchain.js   # initia.js SDK integration
│       └── fx.js           # FX rates + fee logic
│
├── frontend/
│   └── src/
│       ├── pages/ScanPay.jsx   # QR payment flow (core feature)
│       ├── pages/Wallet.jsx    # Balances + bridge
│       └── pages/Receipts.jsx  # Escrow tracking (claim/refund)
│
└── scripts/
    └── faucet.js           # Mint gas tokens
```

---

## Tech Stack

| Layer | Technology | Role |
|------|------------|------|
| Smart Contracts | Move (MoveVM) | Isolated lending markets + HTLC escrow + operator module |
| Appchain (L2) | Initia OPinit | Sovereign rollup (weavelink-1) with execution and settlement |
| L1 Security | Initia Testnet (initiation-2) | Finality, shared liquidity, fraud proofs |
| Backend | Node.js + Express | Stateless operator (match, borrow, escrow, settlement) |
| SDK | @initia/initia.js | Transaction building, signing, chain interaction |
| Frontend | React + Vite | Mobile-first UI, QR payment flow |
| Wallet & Sessions | @initia/interwovenkit-react | Auto-signing sessions + integrated IBC bridge |
| Cross-chain | IBC + OPinit | Asset movement between L1 and appchain |
| Crypto | SHA3-256 (double-hash) | HTLC secret derivation and verification |

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


## Conclusion

WeaveLink bridges DeFi yield and real-world spending by turning passive on-chain positions into active payment rails. By combining isolated lending markets with HTLC-secured operator settlement, the system removes the need to sell assets, preserving capital efficiency while enabling everyday usability.

Built on Initia Interwoven, WeaveLink demonstrates how sovereign appchains can tightly integrate financial primitives and user experience. The result is a trustless, composable system where yield becomes liquid in the real world -- unlocking a new category of crypto-native payments.

## License

MIT
