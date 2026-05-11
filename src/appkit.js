import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { solana } from '@reown/appkit/networks'
import { ConnectorController } from '@reown/appkit-controllers'
import { REOWN_PROJECT_ID, SOLANA_RPC_URL } from './config.js'

const solanaAdapter = new SolanaAdapter()
const BITGET_WALLET_ID = '38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662'
const BITGET_WALLET_NAME = 'Bitget Wallet'
const BITGET_WALLET_ORDER = -1

function isBitgetConnector(connector) {
  return [connector?.id, connector?.explorerId, connector?.name, connector?.explorerWallet?.name, connector?.info?.rdns]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes('bitget') || value === BITGET_WALLET_ID)
}

function setBitgetConnectorPriority(connectors) {
  let changed = false

  for (const connector of connectors) {
    if (!isBitgetConnector(connector)) continue

    if (connector.explorerId !== BITGET_WALLET_ID) {
      connector.explorerId = BITGET_WALLET_ID
      changed = true
    }

    if (connector.explorerWallet?.order !== BITGET_WALLET_ORDER || connector.explorerWallet?.id !== BITGET_WALLET_ID) {
      connector.explorerWallet = {
        ...connector.explorerWallet,
        id: BITGET_WALLET_ID,
        name: connector.explorerWallet?.name || BITGET_WALLET_NAME,
        order: BITGET_WALLET_ORDER,
      }
      changed = true
    }
  }

  return changed
}

function preferBitgetWallet() {
  const changedAll = setBitgetConnectorPriority(ConnectorController.state.allConnectors)
  const changedVisible = setBitgetConnectorPriority(ConnectorController.state.connectors)
  const changed = changedAll || changedVisible

  if (changed) {
    ConnectorController.state.allConnectors = [...ConnectorController.state.allConnectors]
    ConnectorController.state.connectors = [...ConnectorController.state.connectors]
  }
}

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId: REOWN_PROJECT_ID,
  featuredWalletIds: [BITGET_WALLET_ID],
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
    connectorTypeOrder: ['featured', 'injected', 'walletConnect', 'recent', 'custom', 'external', 'recommended'],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#47d18c',
  },
})

ConnectorController.subscribeKey('allConnectors', preferBitgetWallet)
ConnectorController.subscribeKey('connectors', preferBitgetWallet)
preferBitgetWallet()
