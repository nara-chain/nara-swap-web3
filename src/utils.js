import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BRIDGE_ASSETS, NARA_TOKENS } from './config.js'

export function shortAddress(value, start = 5, end = 4) {
  if (!value) return ''
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

export function formatAmount(value, digits = 6) {
  if (value == null || Number.isNaN(value)) return '-'
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

export function trimAmount(value, digits = 6) {
  if (value == null || Number.isNaN(value)) return '-'
  return Number(value).toFixed(digits).replace(/\.?0+$/, '')
}

export function parseUnits(value, decimals) {
  const input = String(value ?? '').trim()
  if (!input || Number(input) <= 0) return 0n
  const [wholeRaw, fracRaw = ''] = input.split('.')
  const whole = wholeRaw || '0'
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || '0')
}

export function unitsToNumber(value, decimals) {
  return Number(value) / 10 ** decimals
}

export function explorerUrl(signature, chain) {
  if (!signature) return ''
  if (chain === 'nara') return `https://explorer.nara.build/tx/${signature}`
  return `https://solscan.io/tx/${signature}`
}

function parseTokenAmount(acct) {
  if (!acct?.data?.[0]) return 0
  return Number(Buffer.from(acct.data[0], 'base64').readBigUInt64LE(64))
}

async function batchRpc(rpcUrl, requests) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requests),
    })
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchBalances(address, { naraRpcUrl, solanaRpcUrl }) {
  if (!address) return {}
  const owner = new PublicKey(address)
  const result = {}

  const naraTokenMints = NARA_TOKENS.filter(t => t.mint).map(t => t.mint)
  const naraAtas = naraTokenMints.map(mint =>
    getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID).toBase58(),
  )
  const solBridgeAssets = BRIDGE_ASSETS.filter(t => t.solanaMint)
  const solAtas = solBridgeAssets.map(t =>
    getAssociatedTokenAddressSync(t.solanaMint, owner, true, TOKEN_PROGRAM_ID).toBase58(),
  )

  const [nara, solana] = await Promise.allSettled([
    batchRpc(naraRpcUrl, [
      { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] },
      { jsonrpc: '2.0', id: 2, method: 'getMultipleAccounts', params: [naraAtas, { commitment: 'confirmed', encoding: 'base64' }] },
    ]),
    batchRpc(solanaRpcUrl, [
      { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] },
      { jsonrpc: '2.0', id: 2, method: 'getMultipleAccounts', params: [solAtas, { commitment: 'confirmed', encoding: 'base64' }] },
    ]),
  ])

  if (nara.status === 'fulfilled' && Array.isArray(nara.value)) {
    const native = nara.value.find(x => x?.id === 1)?.result?.value
    const tokenAccounts = nara.value.find(x => x?.id === 2)?.result?.value
    if (native != null) result['nara:NARA'] = native / LAMPORTS_PER_SOL
    if (tokenAccounts) {
      NARA_TOKENS.filter(t => t.mint).forEach((token, index) => {
        result[`nara:${token.symbol}`] = parseTokenAmount(tokenAccounts[index]) / 10 ** token.decimals
      })
    }
  }

  if (solana.status === 'fulfilled' && Array.isArray(solana.value)) {
    const native = solana.value.find(x => x?.id === 1)?.result?.value
    const tokenAccounts = solana.value.find(x => x?.id === 2)?.result?.value
    if (native != null) result['solana:SOL'] = native / LAMPORTS_PER_SOL
    if (tokenAccounts) {
      solBridgeAssets.forEach((token, index) => {
        result[`solana:${token.symbol}`] = parseTokenAmount(tokenAccounts[index]) / 10 ** token.decimals
      })
    }
  }

  return result
}
