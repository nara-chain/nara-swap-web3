# Nara Swap Web3

Single-page Nara dapp for WalletConnect-based swap and bridge flows.

## Features

- Reown AppKit wallet connection with Solana wallet provider support.
- Nara mainnet swap through Nara Smart Router.
- Nara to Solana and Solana to Nara bridge for USDC, USDT, and SOL.
- Nara and Solana balance polling for the connected wallet.

## Configuration

The default project ID is already configured for local use:

```bash
VITE_REOWN_PROJECT_ID=39b6b2b7c41ad4a663db80a48c302899
```

Optional overrides are listed in `.env.example`.

## Development

```bash
pnpm install
pnpm dev
pnpm build
```
