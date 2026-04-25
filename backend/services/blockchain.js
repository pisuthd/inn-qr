import {
  Wallet,
  RESTClient,
  MnemonicKey,
  MsgExecute,
  MsgSend,
  bcs,
} from '@initia/initia.js'

// === Configuration ===

// Admin mnemonic — the contract deployer
const ENCODED_ADMIN_MNEMONIC = "Y2VsZXJ5IGJhbWJvbyBoYXJ2ZXN0IHBvbnkgamFyIHdpbmRvdyBhdWRpdCBwcm92aWRlIHN3aXRjaCBjb3JlIHNhZG5lc3MgYXNwZWN0IGJvbWIgYWJzb3JiIHBlb3BsZSBtdXN0IGJ1cmRlbiBsYXcgcGF2ZSBhdHRlbmQgcmVhc29uIHJlZmxlY3QgZGVzaWduIG9yYml0"
const ADMIN_MNEMONIC = Buffer.from(ENCODED_ADMIN_MNEMONIC, 'base64').toString('utf-8')

// Operator mnemonic — the operator that borrows USDC on behalf of users
const ENCODED_OPERATOR_MNEMONIC = "c29ycnkgYnVyc3QgcGF5bWVudCBqdW5nbGUgbGVuZ3RoIHN0b21hY2ggY3J5c3RhbCBzdWJqZWN0IHdyZXN0bGUgcHJvZHVjZSB0aWdlciBmb3Jlc3QgdGF0dG9vIGF3ZXNvbWUgc2hpdmVyIHB1cnBvc2UgdHlwZSB1bnVzdWFsIGZvcmVzdCBwYXltZW50IHZlbmRvciBzd2FybSBzdGVwIHdoYXQ="
const OPERATOR_MNEMONIC = Buffer.from(ENCODED_OPERATOR_MNEMONIC, 'base64').toString('utf-8')

const REST_URL = 'https://d3pgy5i52ev547.cloudfront.net/rest'
const GAS_PRICES = '0.015WLINK'
const MODULE_ADDRESS = 'init14wyc4mrufq05j8ryx0m0249hjesyuzak9rq86s'

// HTLC escrow timeout: 30 minutes from now (in seconds)
const ESCROW_TIMEOUT_SECONDS = 30 * 60

// Initialize REST client
const restClient = new RESTClient(REST_URL, { gasPrices: GAS_PRICES })

// Admin wallet — contract deployer, used for register_operator
const adminKey = new MnemonicKey({ mnemonic: ADMIN_MNEMONIC })
const adminWallet = new Wallet(restClient, adminKey)

// Operator wallet — used for create_withdrawal, claim_escrow
const operatorKey = new MnemonicKey({ mnemonic: OPERATOR_MNEMONIC })
const operatorWallet = new Wallet(restClient, operatorKey)

/**
 * Get the operator's address
 */
export function getOperatorAddress() {
  return operatorKey.accAddress
}

/**
 * Get the admin's address
 */
export function getAdminAddress() {
  return adminKey.accAddress
}

/**
 * Check if user has authorized the operator to act on their behalf
 * Calls: market_v1::is_delegate_authorized(user, operator)
 */
export async function isAuthorized(userAddress) {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'market_v1',
      'is_delegate_authorized',
      [],
      [
        bcs.address().serialize(userAddress).toBase64(),
        bcs.address().serialize(operatorKey.accAddress).toBase64(),
      ]
    )
    return res === true
  } catch (err) {
    console.error('isAuthorized error:', err.message)
    return false
  }
}

/**
 * Get user's position in a market
 * Calls: market_v1::get_position(user, market_id)
 * Returns: { supplied, borrowed, collateral } in raw units (6 decimals)
 */
export async function getPosition(userAddress, marketId) {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'market_v1',
      'get_position',
      [],
      [
        bcs.address().serialize(userAddress).toBase64(),
        bcs.u64().serialize(marketId).toBase64(),
      ]
    )
    // res is [supplied, borrowed, collateral]
    return {
      supplied: Number(res[0] || 0),
      borrowed: Number(res[1] || 0),
      collateral: Number(res[2] || 0),
    }
  } catch (err) {
    console.error('getPosition error:', err.message)
    return { supplied: 0, borrowed: 0, collateral: 0 }
  }
}

/**
 * Get market info
 * Calls: market_v1::get_market(market_id)
 * Returns: { loanToken, collateralToken, totalSupply, totalBorrow, totalCollateral, lltv, borrowRate }
 */
export async function getMarket(marketId) {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'market_v1',
      'get_market',
      [],
      [
        bcs.u64().serialize(marketId).toBase64(),
      ]
    )
    return {
      loanToken: Number(res[0]),
      collateralToken: Number(res[1]),
      totalSupply: Number(res[2]),
      totalBorrow: Number(res[3]),
      totalCollateral: Number(res[4]),
      lltv: Number(res[5]),
      borrowRate: Number(res[6]),
    }
  } catch (err) {
    console.error('getMarket error:', err.message)
    return null
  }
}

/**
 * Get health factor for a user in a market
 * Calls: market_v1::get_health_factor(user, market_id)
 * Returns: health factor (100 = 1.0, >= 100 is healthy)
 */
export async function getHealthFactor(userAddress, marketId) {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'market_v1',
      'get_health_factor',
      [],
      [
        bcs.address().serialize(userAddress).toBase64(),
        bcs.u64().serialize(marketId).toBase64(),
      ]
    )
    return Number(res)
  } catch (err) {
    console.error('getHealthFactor error:', err.message)
    return 0
  }
}

/**
 * Check if operator is registered
 * Calls: operator::is_operator_registered(addr)
 */
export async function isOperatorRegistered() {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'operator',
      'is_operator_registered',
      [],
      [
        bcs.address().serialize(operatorKey.accAddress).toBase64(),
      ]
    )
    return res === true
  } catch (err) {
    console.error('isOperatorRegistered error:', err.message)
    return false
  }
}

/**
 * Get escrow details by request ID
 * Calls: operator::get_escrow(request_id)
 * Returns: { requestId, operator, user, tokenId, amount, destinationType, status }
 */
export async function getEscrow(requestId) {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'operator',
      'get_escrow',
      [],
      [
        bcs.u64().serialize(requestId).toBase64(),
      ]
    )
    if (Number(res[0]) === 0) return null // not found
    return {
      requestId: Number(res[0]),
      operator: res[1],
      user: res[2],
      tokenId: Number(res[3]),
      amount: Number(res[4]),
      destinationType: Number(res[5]),
      status: Number(res[6]),
    }
  } catch (err) {
    console.error('getEscrow error:', err.message)
    return null
  }
}

/**
 * Create a withdrawal request on-chain (HTLC escrow)
 * Calls: operator::create_withdrawal(operator, user, market_id, amount, secret_hash, timeout_at, destination_type, destination_info)
 *
 * @param {string} userAddress - The user whose position to borrow from
 * @param {number} marketId - Market ID
 * @param {number} amount - USDC amount in raw units (6 decimals)
 * @param {Buffer} secretHash - SHA3-256 hash of the secret (32 bytes)
 * @returns {{ txHash: string, requestId: number }}
 */
export async function createWithdrawal(userAddress, marketId, amount, secretHash) {
  // Calculate timeout: current time + 30 minutes
  const now = Math.floor(Date.now() / 1000)
  const timeoutAt = now + ESCROW_TIMEOUT_SECONDS

  // Build destination_info from user address (hashed for privacy)
  const destinationInfo = Buffer.from(`fiat:${userAddress}`)

  const msg = new MsgExecute(
    operatorKey.accAddress,  // sender (operator)
    MODULE_ADDRESS,          // module owner
    'operator',              // module name
    'create_withdrawal',     // function name
    [],                      // type arguments
    [
      bcs.address().serialize(userAddress).toBase64(),          // user
      bcs.u64().serialize(marketId).toBase64(),                 // market_id
      bcs.u64().serialize(amount).toBase64(),                   // amount
      bcs.vector(bcs.u8()).serialize(Array.from(secretHash)).toBase64(), // secret_hash
      bcs.u64().serialize(timeoutAt).toBase64(),                // timeout_at
      bcs.u8().serialize(0).toBase64(),                         // destination_type = fiat
      bcs.vector(bcs.u8()).serialize(Array.from(destinationInfo)).toBase64(), // destination_info
    ]
  )

  const signedTx = await operatorWallet.createAndSignTx({ msgs: [msg] })
  const result = await restClient.tx.broadcast(signedTx)

  // After broadcasting, query the chain to find the new request ID
  // The escrow request_id is auto-incremented on-chain
  // We can get it by checking get_next_request_id and subtracting 1
  const nextId = await getNextRequestId()
  const requestId = nextId - 1

  return {
    txHash: result.txhash,
    requestId,
    timeoutAt,
  }
}

/**
 * Claim an escrow on-chain by revealing the secret
 * Calls: operator::claim_escrow(operator, request_id, secret)
 *
 * @param {number} requestId - The escrow request ID
 * @param {Buffer} secret - The HTLC secret preimage
 * @returns {{ txHash: string }}
 */
export async function claimEscrow(requestId, secret) {
  const msg = new MsgExecute(
    operatorKey.accAddress,  // sender (operator)
    MODULE_ADDRESS,          // module owner
    'operator',              // module name
    'claim_escrow',          // function name
    [],                      // type arguments
    [
      bcs.u64().serialize(requestId).toBase64(),
      bcs.vector(bcs.u8()).serialize(Array.from(secret)).toBase64(),
    ]
  )

  const signedTx = await operatorWallet.createAndSignTx({ msgs: [msg] })
  const result = await restClient.tx.broadcast(signedTx)

  return {
    txHash: result.txhash,
  }
}

/**
 * Convert an address to normalized hex (0x...) for comparison
 * Strips leading zero bytes so 32-byte and 20-byte addresses match
 * Handles both bech32 (init1...) and hex (0x...) inputs
 */
export function addressToHex(addr) {
  if (!addr) return ''
  let hex
  if (addr.startsWith('0x')) {
    hex = addr.slice(2).toLowerCase()
  } else {
    try {
      const bytes = bcs.address().serialize(addr).toBytes()
      hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      hex = addr.toLowerCase().replace(/^0x/, '')
    }
  }
  // Strip leading zeros for consistent comparison
  const stripped = hex.replace(/^0+/, '')
  return '0x' + (stripped || '0')
}

/**
 * Send gas tokens from the admin account to a recipient
 * Used by the faucet endpoint to fund new users
 *
 * @param {string} recipient - Bech32 address of the recipient
 * @param {string} amount - Coin amount string (e.g. '100000000000000000WLINK')
 * @returns {{ txHash: string }}
 */
export async function sendGas(recipient, amount = '100000000000000000WLINK') {
  const msg = new MsgSend(adminKey.accAddress, recipient, amount)
  const signedTx = await adminWallet.createAndSignTx({ msgs: [msg] })
  const result = await restClient.tx.broadcast(signedTx)
  return { txHash: result.txhash }
}

// Export REST client for use in server.js (health checks)
export { restClient }

/**
 * Register the operator on-chain (admin only, one-time setup)
 * Calls: operator::register_operator(admin, operator_addr)
 *
 * @returns {{ txHash: string, operatorAddress: string }}
 */
export async function registerOperator() {
  // Check if already registered
  const alreadyRegistered = await isOperatorRegistered()
  if (alreadyRegistered) {
    return { txHash: null, operatorAddress: operatorKey.accAddress, alreadyRegistered: true }
  }

  const msg = new MsgExecute(
    adminKey.accAddress,    // sender (admin)
    MODULE_ADDRESS,         // module owner
    'operator',             // module name
    'register_operator',    // function name
    [],                     // type arguments
    [
      bcs.address().serialize(operatorKey.accAddress).toBase64(),  // operator_addr
    ]
  )

  const signedTx = await adminWallet.createAndSignTx({ msgs: [msg] })
  const result = await restClient.tx.broadcast(signedTx)

  return {
    txHash: result.txhash,
    operatorAddress: operatorKey.accAddress,
    alreadyRegistered: false,
  }
}

/**
 * Get the next request ID on-chain
 * Calls: operator::get_next_request_id()
 */
export async function getNextRequestId() {
  try {
    const res = await restClient.move.viewFunction(
      MODULE_ADDRESS,
      'operator',
      'get_next_request_id',
      [],
      []
    )
    return Number(res)
  } catch (err) {
    console.error('getNextRequestId error:', err.message)
    return 1
  }
}