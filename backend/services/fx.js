import { createHash } from 'crypto'

// Supported rails and their currencies
const RAILS = {
  promptpay: { currency: 'THB', fxRate: 35.0, name: 'PromptPay', country: 'Thailand' },
  vietqr:    { currency: 'VND', fxRate: 25000, name: 'VietQR', country: 'Vietnam' },
  duitnow:   { currency: 'MYR', fxRate: 4.7, name: 'DuitNow', country: 'Malaysia' },
  qris:      { currency: 'IDR', fxRate: 15500, name: 'QRIS', country: 'Indonesia' },
  paynow:    { currency: 'SGD', fxRate: 1.35, name: 'PayNow', country: 'Singapore' },
}

const FX_FEE_RATE = 0.005 // 0.5%
const USDC_DECIMALS = 6

/**
 * Validate rail/currency combination
 */
export function validateRail(rail, currency) {
  const railInfo = RAILS[rail]
  if (!railInfo) {
    return { valid: false, error: `Unsupported rail: ${rail}. Supported: ${Object.keys(RAILS).join(', ')}` }
  }
  if (railInfo.currency !== currency) {
    return { valid: false, error: `Rail "${rail}" requires currency "${railInfo.currency}", got "${currency}"` }
  }
  return { valid: true, railInfo }
}

/**
 * Convert local currency amount to USDC (6 decimals, raw units)
 * @param {number} localAmount - Amount in local currency (e.g., 350 THB)
 * @param {string} rail - The payment rail
 * @returns {{ usdcAmount: number, fxRate: number, fee: number, feeRate: number, totalUsdc: number }}
 */
export function localToUsdc(localAmount, rail) {
  const railInfo = RAILS[rail]
  const fxRate = railInfo.fxRate

  // USDC value before fee
  const usdcBeforeFee = localAmount / fxRate

  // Apply fee
  const fee = usdcBeforeFee * FX_FEE_RATE
  const totalUsdc = usdcBeforeFee + fee

  // Convert to raw USDC units (6 decimals), rounded up to ensure coverage
  const usdcRaw = Math.ceil(totalUsdc * 1_000_000)

  return {
    usdcAmount: Math.ceil(usdcBeforeFee * 1_000_000), // USDC before fee (raw)
    usdcHuman: Number((usdcBeforeFee).toFixed(2)),
    fxRate,
    fee: Math.ceil(fee * 1_000_000), // fee in raw USDC
    feeHuman: Number((fee).toFixed(6)),
    feeRate: FX_FEE_RATE,
    totalUsdc: usdcRaw, // total USDC to charge (raw)
    totalUsdcHuman: Number((totalUsdc).toFixed(2)),
    currency: railInfo.currency,
    railName: railInfo.name,
    country: railInfo.country,
  }
}

/**
 * Get rail info
 */
export function getRailInfo(rail) {
  return RAILS[rail] || null
}

/**
 * Compute HTLC secret from user-provided memo
 * secret = sha3-256(memo)
 * secretHash = sha3-256(secret)
 *
 * The memo is stored in-memory so the secret can be reconstructed for claim_escrow.
 */
export function computeSecretFromMemo(memo) {
  const secret = createHash('sha3-256').update(memo).digest()
  const secretHash = createHash('sha3-256').update(secret).digest()
  return { secret, secretHash }
}

/**
 * Validate memo: alphanumeric, no whitespace, 4-8 chars
 */
export function validateMemo(memo) {
  if (!memo || typeof memo !== 'string') {
    return { valid: false, error: 'Memo is required' }
  }
  if (!/^[a-zA-Z0-9]+$/.test(memo)) {
    return { valid: false, error: 'Memo must be alphanumeric (no spaces or special chars)' }
  }
  if (memo.length < 4) {
    return { valid: false, error: 'Memo must be at least 4 characters' }
  }
  if (memo.length > 8) {
    return { valid: false, error: 'Memo must be at most 8 characters' }
  }
  return { valid: true }
}

/**
 * Get all supported rails
 */
export function getSupportedRails() {
  return Object.entries(RAILS).map(([id, info]) => ({
    id,
    name: info.name,
    currency: info.currency,
    country: info.country,
    fxRate: info.fxRate,
  }))
}