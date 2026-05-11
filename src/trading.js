import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { makeBridgeIxs, calculateBridgeFee, BRIDGE_TOKENS, extractMessageId } from 'nara-sdk/src/bridge'
import { Buffer } from 'buffer'
import { BRIDGE_ASSETS, NARA_ROUTER_BASE, NARA_RPC_URL, SOLANA_RPC_URL, WSOL_MINT } from './config.js'
import { parseUnits } from './utils.js'
import { signAndSendInstructions, waitForConfirmation } from './tx.js'

const supportedBridgeTokens = new Set(BRIDGE_ASSETS.map(asset => asset.symbol))

function getSupportedBridgeConfig(token) {
  if (!supportedBridgeTokens.has(token)) return null
  return BRIDGE_TOKENS[token] ?? null
}

export async function fetchNaraQuote({ fromToken, toToken, amount, slippage }) {
  const rawAmount = parseUnits(amount, fromToken.decimals)
  if (rawAmount <= 0n) return null
  const inputMint = fromToken.mint ? fromToken.mint.toBase58() : WSOL_MINT.toBase58()
  const outputMint = toToken.mint ? toToken.mint.toBase58() : WSOL_MINT.toBase58()
  const url = new URL(`${NARA_ROUTER_BASE}/quote`)
  url.searchParams.set('input_mint', inputMint)
  url.searchParams.set('output_mint', outputMint)
  url.searchParams.set('amount_in', rawAmount.toString())
  url.searchParams.set('slippage_bps', String(Math.round(slippage * 100)))

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 7000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || `Quote failed (${res.status})`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function parseJsonResponse(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: text || `HTTP ${res.status}` }
  }
}

export async function executeNaraSwap({ walletProvider, address, fromToken, toToken, amount, slippage }) {
  const rawAmount = parseUnits(amount, fromToken.decimals)
  if (rawAmount <= 0n) throw new Error('Enter an amount')
  if (rawAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is too large for the router request')
  }
  const amountIn = Number(rawAmount)

  const inputMint = fromToken.mint ? fromToken.mint.toBase58() : WSOL_MINT.toBase58()
  const outputMint = toToken.mint ? toToken.mint.toBase58() : WSOL_MINT.toBase58()
  const orderRes = await fetch(`${NARA_ROUTER_BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input_mint: inputMint,
      output_mint: outputMint,
      amount_in: amountIn,
      slippage_bps: Math.round(slippage * 100),
      user_pubkey: address,
    }),
  })
  const order = await parseJsonResponse(orderRes)
  if (!orderRes.ok || order.error) throw new Error(order.error || `Order failed (${orderRes.status})`)
  if (!order.unsigned_tx_base64) throw new Error('Router did not return an unsigned transaction')

  if (!walletProvider?.signTransaction) throw new Error('Connected wallet does not support transaction signing')
  const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(order.unsigned_tx_base64, 'base64')))
  const connection = new Connection(NARA_RPC_URL, 'confirmed')
  const signedTx = await walletProvider.signTransaction(tx)
  const signedTxB64 = Buffer.from(signedTx.serialize()).toString('base64')
  const execRes = await fetch(`${NARA_ROUTER_BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: order.order_id, signed_tx_base64: signedTxB64 }),
  })
  const execData = await parseJsonResponse(execRes)
  if (!execRes.ok || execData.error) throw new Error(execData.error || `Execute failed (${execRes.status})`)
  const signature = execData.signature
  if (!signature) throw new Error('Router did not return a signature')
  await waitForConfirmation(connection, signature, 60000)
  return signature
}

export function getBridgePreview({ token, amount }) {
  const cfg = getSupportedBridgeConfig(token)
  if (!cfg || !amount || Number(amount) <= 0) return null
  const raw = parseUnits(amount, cfg.decimals)
  const split = calculateBridgeFee(raw, undefined, cfg.minFee ?? 0n)
  return { cfg, raw, ...split }
}

export function getBridgeMinimum(token) {
  const cfg = getSupportedBridgeConfig(token)
  if (!cfg) return null
  return Number(cfg.minAmount) / 10 ** cfg.decimals
}

export async function executeBridge({ walletProvider, address, token, fromChain, amount }) {
  const cfg = getSupportedBridgeConfig(token)
  if (!cfg) throw new Error(`Unsupported token: ${token}`)
  const rawAmount = parseUnits(amount, cfg.decimals)
  if (rawAmount < cfg.minAmount) {
    const min = Number(cfg.minAmount) / 10 ** cfg.decimals
    throw new Error(`Minimum bridge amount is ${min} ${token}`)
  }

  const sender = new PublicKey(address)
  const connection = new Connection(fromChain === 'nara' ? NARA_RPC_URL : SOLANA_RPC_URL, 'confirmed')
  const built = makeBridgeIxs({
    token,
    fromChain,
    sender,
    recipient: sender,
    amount: rawAmount,
  })

  const signature = await signAndSendInstructions({
    connection,
    payer: sender,
    walletProvider,
    instructions: built.instructions,
    extraSigners: [built.uniqueMessageKeypair],
    useNaraAlt: fromChain === 'nara',
    computeUnitLimit: 1_400_000,
  })

  let messageId = null
  try {
    messageId = await extractMessageId(connection, signature)
  } catch {}

  return {
    signature,
    messageId,
    feeAmount: built.feeAmount,
    bridgeAmount: built.bridgeAmount,
  }
}
