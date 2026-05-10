import { PublicKey } from '@solana/web3.js'
import {
  NARA_SOL_MINT,
  NARA_USDC_MINT,
  NARA_USDT_MINT,
  SOLANA_USDC_MINT,
  SOLANA_USDT_MINT,
} from 'nara-sdk/src/bridge'

export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || '39b6b2b7c41ad4a663db80a48c302899'
export const NARA_RPC_URL = import.meta.env.VITE_NARA_RPC_URL || 'https://mainnet-api.nara.build/'
export const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com'
export const NARA_ROUTER_BASE = import.meta.env.VITE_NARA_ROUTER_BASE || 'https://smart-router.nara.build'

export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')
export const NARA_ALT_ADDRESS = '3uw7RatGTB4hdHnuVLXjsqcMZ87zXsMSc3XbyoPA8mB7'

export const NARA_TOKENS = [
  { symbol: 'NARA', name: 'Nara', decimals: 9, mint: null, isNative: true, chain: 'nara' },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6, mint: NARA_USDC_MINT, chain: 'nara' },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6, mint: NARA_USDT_MINT, chain: 'nara' },
  { symbol: 'SOL', name: 'Wrapped SOL', decimals: 9, mint: NARA_SOL_MINT, chain: 'nara' },
]

export const BRIDGE_ASSETS = [
  {
    symbol: 'USDC',
    decimals: 6,
    naraMint: NARA_USDC_MINT,
    solanaMint: SOLANA_USDC_MINT,
  },
  {
    symbol: 'USDT',
    decimals: 6,
    naraMint: NARA_USDT_MINT,
    solanaMint: SOLANA_USDT_MINT,
  },
  {
    symbol: 'SOL',
    decimals: 9,
    naraMint: NARA_SOL_MINT,
    solanaMint: null,
  },
]

export const GAS_RESERVE = 0.005
