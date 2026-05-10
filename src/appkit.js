import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { solana } from '@reown/appkit/networks'
import { REOWN_PROJECT_ID, SOLANA_RPC_URL } from './config.js'

const solanaAdapter = new SolanaAdapter()

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'Nara Swap',
    description: 'Swap and bridge assets on Nara.',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://nara.build',
    icons: [typeof window !== 'undefined' ? `${window.location.origin}/tokens/nara.png` : 'https://nara.build/favicon.png'],
  },
  customRpcUrls: {
    [solana.caipNetworkId]: [{ url: SOLANA_RPC_URL }],
  },
  features: {
    analytics: true,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#47d18c',
  },
})
