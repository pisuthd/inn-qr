import express from 'express'
import cors from 'cors'
import { validateRail, localToUsdc, computeSecret, getSupportedRails } from './services/fx.js'
import {
  restClient,
  getOperatorAddress,
  getAdminAddress,
  isAuthorized,
  getPosition,
  getMarket,
  getHealthFactor,
  isOperatorRegistered,
  getEscrow,
  getNextRequestId,
  createWithdrawal,
  claimEscrow,
  registerOperator,
  addressToHex,
} from './services/blockchain.js'

const app = express()
const PORT = 3001

// Operator seed for deterministic HTLC secrets (server-side secret)
const OPERATOR_SEED = 'weavelink-htlc-seed-v1'

app.use(cors())
app.use(express.json())

// ============================================================================
//  Health check & info
// ============================================================================

app.get('/api', (req, res) => {
  res.json({
    name: 'WeaveLink Operator API',
    version: '1.0.0',
    admin: getAdminAddress(),
    operator: getOperatorAddress(),
    rails: getSupportedRails(),
    endpoints: [
      'GET  /api/setup     — Health check & prerequisites',
      'POST /api/register  — Register operator on-chain (admin)',
      'POST /api/match     — Quote & authorization check',
      'POST /api/confirm   — Create escrow on-chain',
      'POST /api/approve   — Claim escrow (settlement proof)',
    ],
  })
})

// ============================================================================
//  GET /api/setup — Health check & prerequisites
// ============================================================================

app.get('/api/setup', async (req, res) => {
  try {
    const registered = await isOperatorRegistered()

    // Check if operator account exists on-chain (has been funded)
    let operatorFunded = false
    try {
      await restClient.auth.accountInfo(getOperatorAddress())
      operatorFunded = true
    } catch (err) {
      operatorFunded = false
    }

    // Check if admin account exists on-chain (needed to register operator)
    let adminFunded = false
    try {
      await restClient.auth.accountInfo(getAdminAddress())
      adminFunded = true
    } catch (err) {
      adminFunded = false
    }

    const ready = registered && operatorFunded && adminFunded

    // Build step-by-step setup instructions
    const nextSteps = []
    if (!adminFunded) {
      nextSteps.push('1. Fund the ADMIN account with gas tokens (needed to register operator)')
      nextSteps.push(`   Admin: ${getAdminAddress()}`)
    }
    if (!operatorFunded) {
      nextSteps.push('2. Fund the OPERATOR account with gas tokens (needed to create withdrawals)')
      nextSteps.push(`   Operator: ${getOperatorAddress()}`)
      nextSteps.push('   Run: node ../scripts/faucet.js ' + getOperatorAddress())
    }
    if (adminFunded && !registered) {
      nextSteps.push('3. Register the operator on-chain: POST /api/register')
    }
    if (ready) {
      nextSteps.length = 0
      nextSteps.push('✅ All good! Operator is ready to process withdrawals.')
    }

    res.json({
      ready,
      operator: {
        address: getOperatorAddress(),
        funded: operatorFunded,
        registered,
      },
      admin: {
        address: getAdminAddress(),
        funded: adminFunded,
      },
      contract: {
        moduleAddress: 'init14wyc4mrufq05j8ryx0m0249hjesyuzak9rq86s',
      },
      nextSteps,
    })
  } catch (err) {
    console.error('/api/setup error:', err)
    res.status(500).json({ error: 'Health check failed', details: err.message })
  }
})

// ============================================================================
//  POST /api/register — Register Operator On-Chain
// ============================================================================

app.post('/api/register', async (req, res) => {
  try {
    const result = await registerOperator()

    if (result.alreadyRegistered) {
      return res.json({
        status: 'already_registered',
        message: 'Operator is already registered on-chain',
        operatorAddress: result.operatorAddress,
      })
    }

    res.json({
      status: 'registered',
      message: 'Operator registered successfully',
      operatorAddress: result.operatorAddress,
      txHash: result.txHash
    })
  } catch (err) {
    console.error('/api/register error:', err)
    res.status(500).json({ error: 'Registration failed', details: err.message })
  }
})

// ============================================================================
//  POST /api/match — Quote & Authorization Check
// ============================================================================

app.post('/api/match', async (req, res) => {
  try {
    const { userAddress, rail, proxyType, proxyValue, currency, amount, marketId } = req.body

    // --- Validate required fields ---
    if (!userAddress || !rail || !proxyType || !proxyValue || !currency || !amount || !marketId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userAddress', 'rail', 'proxyType', 'proxyValue', 'currency', 'amount', 'marketId'],
      })
    }

    // --- Validate rail/currency combo ---
    const railCheck = validateRail(rail, currency)
    if (!railCheck.valid) {
      return res.status(400).json({ error: railCheck.error })
    }

    // --- Validate proxy type ---
    const validProxyTypes = ['phone', 'national_id', 'business_id']
    if (!validProxyTypes.includes(proxyType)) {
      return res.status(400).json({
        error: `Invalid proxyType "${proxyType}". Must be one of: ${validProxyTypes.join(', ')}`,
      })
    }

    const localAmount = Number(amount)
    if (localAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' })
    }

    const marketIdNum = Number(marketId)

    // --- Simulate matching delay (1-3 seconds) ---
    const delay = 1000 + Math.random() * 2000
    await new Promise((resolve) => setTimeout(resolve, delay))

    // --- Compute FX quote ---
    const quote = localToUsdc(localAmount, rail)

    // --- Query chain: is operator authorized by user? ---
    const authorized = await isAuthorized(userAddress)

    // --- Query chain: user position ---
    const position = await getPosition(userAddress, marketIdNum)

    // --- Query chain: market info ---
    const market = await getMarket(marketIdNum)
    if (!market) {
      return res.status(400).json({ error: `Market ${marketIdNum} not found` })
    }

    // --- Check borrow capacity ---
    // Available liquidity in market
    const marketLiquidity = market.totalSupply - market.totalBorrow
    const hasMarketLiquidity = marketLiquidity >= quote.totalUsdc

    // Check user's max borrow capacity (simplified)
    // Health factor check is done on-chain, but we give a pre-check hint
    const healthFactor = await getHealthFactor(userAddress, marketIdNum)

    const response = {
      status: 'matched',
      operator: {
        address: getOperatorAddress(),
        name: 'WeaveLink Operator',
        country: quote.country,
        area: quote.railName,
        rails: getSupportedRails().map(r => r.id),
      },
      quote: {
        localAmount,
        currency: quote.currency,
        rail,
        railName: quote.railName,
        country: quote.country,
        fxRate: quote.fxRate,
        usdcAmount: quote.usdcHuman,
        usdcRaw: quote.usdcAmount,
        fee: {
          rate: `${(quote.feeRate * 100).toFixed(1)}%`,
          usdc: quote.feeHuman,
          usdcRaw: quote.fee,
        },
        totalUsdc: quote.totalUsdcHuman,
        totalUsdcRaw: quote.totalUsdc,
      },
      authorization: {
        needsAuthorization: !authorized,
        isAuthorized: authorized,
        message: authorized
          ? 'Operator is authorized to borrow on your behalf'
          : 'You must authorize the operator before confirming. Call market_v1::set_authorization(your_signer, operator_address, true)',
      },
      market: {
        id: marketIdNum,
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        lltv: market.lltv,
        liquidity: marketLiquidity,
        hasSufficientLiquidity: hasMarketLiquidity,
      },
      position: {
        supplied: position.supplied,
        borrowed: position.borrowed,
        collateral: position.collateral,
        healthFactor,
        healthFactorHuman: (healthFactor / 100).toFixed(2),
      },
      proxy: {
        type: proxyType,
        value: proxyValue,
      },
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (err) {
    console.error('/api/match error:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

// ============================================================================
//  POST /api/confirm — Create Escrow On-Chain
// ============================================================================

app.post('/api/confirm', async (req, res) => {
  try {
    const { userAddress, rail, proxyType, proxyValue, currency, amount, marketId } = req.body

    // --- Validate required fields ---
    if (!userAddress || !rail || !proxyType || !proxyValue || !currency || !amount || !marketId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userAddress', 'rail', 'proxyType', 'proxyValue', 'currency', 'amount', 'marketId'],
      })
    }

    // --- Validate rail/currency ---
    const railCheck = validateRail(rail, currency)
    if (!railCheck.valid) {
      return res.status(400).json({ error: railCheck.error })
    }

    const localAmount = Number(amount)
    const marketIdNum = Number(marketId)

    // --- Compute FX quote ---
    const quote = localToUsdc(localAmount, rail)
    const usdcAmount = quote.totalUsdc

    // --- Verify authorization on-chain ---
    const authorized = await isAuthorized(userAddress)
    if (!authorized) {
      return res.status(403).json({
        error: 'User has not authorized the operator',
        message: 'Call market_v1::set_authorization first',
        operatorAddress: getOperatorAddress(),
      })
    }

    // --- Verify market exists ---
    const market = await getMarket(marketIdNum)
    if (!market) {
      return res.status(400).json({ error: `Market ${marketIdNum} not found` })
    }

    // --- Verify market has enough liquidity ---
    const marketLiquidity = market.totalSupply - market.totalBorrow
    if (marketLiquidity < usdcAmount) {
      return res.status(400).json({
        error: 'Insufficient market liquidity',
        required: usdcAmount,
        available: marketLiquidity,
      })
    }

    // --- Compute deterministic HTLC secret ---
    // Normalize user address to hex for consistent secret computation
    const userAddressHex = addressToHex(userAddress)
    const { secret, secretHash } = computeSecret(OPERATOR_SEED, userAddressHex, usdcAmount, marketIdNum)

    // --- Execute create_withdrawal on-chain ---
    const result = await createWithdrawal(userAddress, marketIdNum, usdcAmount, secretHash)

    // --- Return receipt ---
    res.json({
      status: 'escrow_created',
      requestId: result.requestId,
      txHash: result.txHash,
      timeoutAt: result.timeoutAt,
      timeoutMinutes: 30,
      receipt: {
        requestId: result.requestId,
        userAddress,
        operatorAddress: getOperatorAddress(),
        marketId: marketIdNum,
        rail,
        proxyType,
        proxyValue,
        currency: quote.currency,
        localAmount,
        usdcAmount: quote.totalUsdcHuman,
        usdcRaw: usdcAmount,
        fxRate: quote.fxRate,
        fee: quote.feeHuman,
        timestamp: new Date().toISOString(),
        receiptUrl: `https://www.kasikornbank.com/SiteCollectionDocuments/personal/digital-banking/kplus/v2/img/instruction/slip-history-05.jpg`,
      },
    })
  } catch (err) {
    console.error('/api/confirm error:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

// ============================================================================
//  POST /api/approve — Claim Escrow (Settlement Proof)
// ============================================================================

app.post('/api/approve', async (req, res) => {
  try {
    const { requestId, userAddress, amount, marketId } = req.body

    // --- Validate required fields ---
    if (!requestId) {
      return res.status(400).json({
        error: 'Missing required field: requestId',
      })
    }

    const requestIdNum = Number(requestId)

    // --- Query escrow on-chain ---
    const escrow = await getEscrow(requestIdNum)
    if (!escrow) {
      return res.status(404).json({
        error: `Escrow ${requestIdNum} not found`,
      })
    }

    // --- Verify escrow is in "locked" status ---
    if (escrow.status !== 0) {
      const statusNames = { 0: 'locked', 1: 'claimed', 2: 'refunded' }
      return res.status(400).json({
        error: `Escrow is not in locked status`,
        status: statusNames[escrow.status] || escrow.status,
        requestId: requestIdNum,
      })
    }

    // --- Reconstruct deterministic secret ---
    // Use the on-chain escrow data to reconstruct
    const escrowAmount = escrow.amount
    // Normalize to hex for consistent secret computation (same as /confirm)
    const escrowUserHex = addressToHex(escrow.user)
    // We need marketId - try from request body or from escrow if available
    const escrowMarketId = Number(marketId) || 1 // fallback to 1 if not provided

    console.log(`Approve: reconstructing secret for request ${requestIdNum}, user=${escrowUserHex}, amount=${escrowAmount}, marketId=${escrowMarketId}`)
    const { secret } = computeSecret(OPERATOR_SEED, escrowUserHex, escrowAmount, escrowMarketId)

    // --- Execute claim_escrow on-chain ---
    const result = await claimEscrow(requestIdNum, secret)

    res.json({
      status: 'claimed',
      requestId: requestIdNum,
      txHash: result.txHash,
      escrow: {
        requestId: escrow.requestId,
        operator: escrow.operator,
        user: escrow.user,
        amount: escrow.amount,
        amountHuman: (escrow.amount / 1_000_000).toFixed(2),
        tokenId: escrow.tokenId,
        previousStatus: 'locked',
        newStatus: 'claimed',
      },
      settlement: {
        settledAt: new Date().toISOString()
      },
    })
  } catch (err) {
    console.error('/api/approve error:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

// ============================================================================
//  GET /api/receipts/:userAddress — List user's escrow receipts
// ============================================================================

app.get('/api/receipts/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params

    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress parameter' })
    }

    // Get total escrow count on-chain
    const nextId = await getNextRequestId()

    if (nextId <= 1) {
      return res.json({ receipts: [] })
    }

    // Normalize the requested user address to hex for comparison
    const userHex = addressToHex(userAddress)
    console.log(`Receipts request: ${userAddress} -> hex: ${userHex}`)

    // Fetch all escrows and filter by user
    const receipts = []
    for (let i = 1; i < nextId; i++) {
      const escrow = await getEscrow(i)
      if (!escrow) continue

      // Filter: only escrows belonging to this user (compare in hex)
      const escrowUserHex = addressToHex(escrow.user)
      if (escrowUserHex !== userHex) continue

      const statusNames = { 0: 'locked', 1: 'claimed', 2: 'refunded' }
      receipts.push({
        requestId: escrow.requestId,
        operator: escrow.operator,
        user: escrow.user,
        tokenId: escrow.tokenId,
        amount: escrow.amount,
        amountHuman: (escrow.amount / 1_000_000).toFixed(2),
        destinationType: escrow.destinationType,
        status: statusNames[escrow.status] || 'unknown',
        statusCode: escrow.status,
        receiptUrl: `https://www.kasikornbank.com/SiteCollectionDocuments/personal/digital-banking/kplus/v2/img/instruction/slip-history-05.jpg`,
      })
    }

    // Sort newest first
    receipts.reverse()

    res.json({ receipts })
  } catch (err) {
    console.error('/api/receipts error:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

// ============================================================================
//  Start server
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 WeaveLink Operator API running on http://localhost:${PORT}`)
  console.log(`📋 Operator address: ${getOperatorAddress()}`)
  console.log(`📡 Endpoints:`)
  console.log(`   POST /api/match    — Quote & authorization check`)
  console.log(`   POST /api/confirm  — Create escrow on-chain`)
  console.log(`   POST /api/approve  — Claim escrow (settlement proof)`)
  console.log(`   GET  /api          — API info & supported rails`)
})