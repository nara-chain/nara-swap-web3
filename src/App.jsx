import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/react'
import { NARA_RPC_URL, SOLANA_RPC_URL, NARA_TOKENS, BRIDGE_ASSETS, GAS_RESERVE } from './config.js'
import { executeBridge, executeNaraSwap, fetchNaraQuote, getBridgeMinimum, getBridgePreview } from './trading.js'
import { explorerUrl, fetchBalances, formatAmount, shortAddress, trimAmount, unitsToNumber } from './utils.js'

function TokenIcon({ symbol }) {
  return <img className="token-icon" src={`/tokens/${symbol.toLowerCase()}.png`} alt="" />
}

function ChainTokenIcon({ symbol, chain }) {
  const badgeSymbol = chain === 'nara' ? 'NARA' : 'SOL'
  return (
    <span className={`chain-token-icon ${chain}`}>
      <TokenIcon symbol={symbol} />
      <span className="chain-badge">
        <TokenIcon symbol={badgeSymbol} />
      </span>
    </span>
  )
}

function BalanceRow({ chain, token, value }) {
  return (
    <div className="balance-row">
      <span className="balance-asset">
        <ChainTokenIcon symbol={token.symbol} chain={chain} />
        <span>{token.symbol}</span>
      </span>
      <strong>{formatAmount(value, 6)}</strong>
    </div>
  )
}

function FlipIcon() {
  return (
    <svg className="flip-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path className="flip-down" d="M8 4v14m0 0 4-4m-4 4-4-4" />
      <path className="flip-up" d="M16 20V6m0 0-4 4m4-4 4 4" />
    </svg>
  )
}

function AssetButton({ token, active, onClick }) {
  return (
    <button className={`asset-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <TokenIcon symbol={token.symbol} />
      <span>{token.symbol}</span>
    </button>
  )
}

function TokenDropdown({ tokens, selectedIndex, onChange, ariaLabel, iconChain }) {
  const [open, setOpen] = useState(false)
  const selected = tokens[selectedIndex]
  const renderIcon = token => iconChain ? <ChainTokenIcon symbol={token.symbol} chain={iconChain} /> : <TokenIcon symbol={token.symbol} />

  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="token-dropdown" onPointerDown={event => event.stopPropagation()}>
      <button
        type="button"
        className={`token-trigger ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {renderIcon(selected)}
        <span>{selected.symbol}</span>
        <span className="chevron">⌄</span>
      </button>
      {open && (
        <div className="token-menu" role="listbox" aria-label={ariaLabel}>
          {tokens.map((token, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`token-option ${index === selectedIndex ? 'active' : ''}`}
              key={token.symbol}
              onClick={() => {
                onChange(index)
                setOpen(false)
              }}
            >
              {renderIcon(token)}
              <span>
                <strong>{token.symbol}</strong>
                <small>{token.name}</small>
              </span>
              {index === selectedIndex && <b>✓</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfirmModal({ action, onCancel }) {
  if (!action) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="confirm-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
        <div>
          <p className="eyebrow">Review</p>
          <h2>{action.title}</h2>
        </div>
        <div className="confirm-lines">
          {action.lines.map(line => (
            <div className="confirm-line" key={line.label}>
              <span>{line.label}</span>
              <strong>{line.value}</strong>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" onClick={action.onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('solana')

  const [activeTab, setActiveTab] = useState('swap')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [balances, setBalances] = useState({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const [fromIndex, setFromIndex] = useState(0)
  const [toIndex, setToIndex] = useState(1)
  const [swapAmount, setSwapAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [slippage, setSlippage] = useState(1)
  const [swapExecuting, setSwapExecuting] = useState(false)
  const [swapResult, setSwapResult] = useState(null)
  const [swapFlipAnimating, setSwapFlipAnimating] = useState(false)

  const [bridgeToken, setBridgeToken] = useState('USDC')
  const [bridgeFrom, setBridgeFrom] = useState('solana')
  const [bridgeAmount, setBridgeAmount] = useState('')
  const [bridgeExecuting, setBridgeExecuting] = useState(false)
  const [bridgeResult, setBridgeResult] = useState(null)
  const [bridgeFlipAnimating, setBridgeFlipAnimating] = useState(false)

  const fromToken = NARA_TOKENS[fromIndex]
  const toToken = NARA_TOKENS[toIndex]
  const bridgeAsset = BRIDGE_ASSETS.find(asset => asset.symbol === bridgeToken)
  const bridgeTokens = useMemo(() => BRIDGE_ASSETS.map(asset => ({
    ...asset,
    name: asset.symbol === 'SOL' ? 'Solana' : `${asset.symbol} stablecoin`,
  })), [])
  const bridgeTokenIndex = Math.max(0, bridgeTokens.findIndex(asset => asset.symbol === bridgeToken))
  const bridgePreview = useMemo(() => getBridgePreview({ token: bridgeToken, amount: bridgeAmount }), [bridgeToken, bridgeAmount])
  const bridgeMinimum = getBridgeMinimum(bridgeToken)

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances({})
      return
    }
    setBalancesLoading(true)
    try {
      setBalances(await fetchBalances(address, { naraRpcUrl: NARA_RPC_URL, solanaRpcUrl: SOLANA_RPC_URL }))
    } catch (error) {
      setToast({ type: 'error', text: error.message || 'Failed to load balances' })
    } finally {
      setBalancesLoading(false)
    }
  }, [address])

  useEffect(() => {
    refreshBalances()
    const id = setInterval(refreshBalances, 30000)
    return () => clearInterval(id)
  }, [refreshBalances])

  useEffect(() => {
    setQuote(null)
    setSwapResult(null)
    if (!swapAmount || Number(swapAmount) <= 0 || fromIndex === toIndex) return
    const id = setTimeout(async () => {
      setQuoteLoading(true)
      try {
        const data = await fetchNaraQuote({ fromToken, toToken, amount: swapAmount, slippage })
        setQuote(data)
      } catch (error) {
        setToast({ type: 'error', text: error.name === 'AbortError' ? 'Quote timed out' : (error.message || 'Quote failed') })
      } finally {
        setQuoteLoading(false)
      }
    }, 450)
    return () => clearTimeout(id)
  }, [fromIndex, fromToken, slippage, swapAmount, toIndex, toToken])

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 3600)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!accountMenuOpen) return undefined
    const close = () => setAccountMenuOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    if (!isConnected) setAccountMenuOpen(false)
  }, [isConnected])

  function balanceOf(chain, symbol) {
    return balances[`${chain}:${symbol}`]
  }

  async function copyAddress() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setToast({ type: 'success', text: 'Address copied' })
      setAccountMenuOpen(false)
    } catch {
      setToast({ type: 'error', text: 'Failed to copy address' })
    }
  }

  async function disconnectWallet() {
    setAccountMenuOpen(false)
    await disconnect()
    setBalances({})
  }

  function requireWallet() {
    if (isConnected && walletProvider && address) return true
    open()
    return false
  }

  function setMaxSwap() {
    const balance = balanceOf('nara', fromToken.symbol)
    if (balance == null) return
    const next = fromToken.isNative ? Math.max(0, balance - GAS_RESERVE) : balance
    setSwapAmount(next ? String(next) : '')
  }

  function setMaxBridge() {
    const balance = balanceOf(bridgeFrom, bridgeToken)
    if (balance == null) return
    const next = bridgeToken === (bridgeFrom === 'nara' ? 'NARA' : 'SOL') ? Math.max(0, balance - GAS_RESERVE) : balance
    setBridgeAmount(next ? String(next) : '')
  }

  function pulseFlip(setAnimating) {
    setAnimating(false)
    requestAnimationFrame(() => {
      setAnimating(true)
      window.setTimeout(() => setAnimating(false), 420)
    })
  }

  function flipSwapTokens() {
    pulseFlip(setSwapFlipAnimating)
    setFromIndex(toIndex)
    setToIndex(fromIndex)
    setSwapAmount('')
    setQuote(null)
    setSwapResult(null)
  }

  function flipBridgeDirection() {
    pulseFlip(setBridgeFlipAnimating)
    setBridgeFrom(bridgeFrom === 'nara' ? 'solana' : 'nara')
    setBridgeAmount('')
    setBridgeResult(null)
  }

  function validateGas(chain) {
    const native = chain === 'nara' ? 'NARA' : 'SOL'
    const balance = balanceOf(chain, native) ?? 0
    if (balance < GAS_RESERVE) {
      setToast({ type: 'error', text: `Keep at least ${GAS_RESERVE} ${native} for gas` })
      return false
    }
    return true
  }

  const quoteInRaw = Number(quote?.amount_in || quote?.inAmount || 0)
  const quoteOutRaw = Number(quote?.amount_out || quote?.outAmount || 0)
  const minOutRaw = Number(quote?.min_amount_out || quote?.otherAmountThreshold || quoteOutRaw || 0)
  const quoteOut = quoteOutRaw ? quoteOutRaw / 10 ** toToken.decimals : null
  const minOut = minOutRaw ? minOutRaw / 10 ** toToken.decimals : null
  const naraBalance = balanceOf('nara', 'NARA')
  const bridgeReceive = bridgePreview ? unitsToNumber(bridgePreview.bridgeAmount, bridgePreview.cfg.decimals) : null
  const bridgeFee = bridgePreview ? unitsToNumber(bridgePreview.feeAmount, bridgePreview.cfg.decimals) : null
  const bridgeRate = bridgeReceive != null && Number(bridgeAmount) > 0 ? bridgeReceive / Number(bridgeAmount) : null
  const bridgeTooSmall = Boolean(bridgeAmount && bridgeMinimum != null && Number(bridgeAmount) < bridgeMinimum)
  const rate = quoteInRaw && quoteOutRaw
    ? (quoteOutRaw / 10 ** toToken.decimals) / (quoteInRaw / 10 ** fromToken.decimals)
    : null

  function askSwap() {
    if (!requireWallet() || !quote || !validateGas('nara')) return
    const fromBalance = balanceOf('nara', fromToken.symbol) ?? 0
    if (Number(swapAmount) > fromBalance) {
      setToast({ type: 'error', text: `Insufficient ${fromToken.symbol} balance` })
      return
    }
    setConfirmAction({
      title: 'Confirm swap',
      lines: [
        { label: 'Pay', value: `${swapAmount} ${fromToken.symbol}` },
        { label: 'Receive', value: `${trimAmount(minOut)} ${toToken.symbol} min` },
        { label: 'Route', value: 'Nara Router' },
        { label: 'Slippage', value: `${slippage}%` },
      ],
      onConfirm: doSwap,
    })
  }

  async function doSwap() {
    setConfirmAction(null)
    setSwapExecuting(true)
    setSwapResult(null)
    try {
      const signature = await executeNaraSwap({ walletProvider, address, fromToken, toToken, amount: swapAmount, slippage })
      setSwapResult({ ok: true, signature, chain: 'nara' })
      setSwapAmount('')
      setQuote(null)
      setToast({ type: 'success', text: 'Swap confirmed' })
      setTimeout(refreshBalances, 2500)
    } catch (error) {
      setSwapResult({ ok: false, error: error.message || 'Swap failed' })
    } finally {
      setSwapExecuting(false)
    }
  }

  function askBridge() {
    if (!requireWallet() || !bridgeAsset || !validateGas(bridgeFrom)) return
    const sourceBalance = balanceOf(bridgeFrom, bridgeToken) ?? 0
    if (!bridgeAmount || Number(bridgeAmount) <= 0) {
      setToast({ type: 'error', text: 'Enter a bridge amount' })
      return
    }
    if (bridgeMinimum != null && Number(bridgeAmount) < bridgeMinimum) {
      setToast({ type: 'error', text: `Minimum bridge amount is ${trimAmount(bridgeMinimum)} ${bridgeToken}` })
      return
    }
    if (Number(bridgeAmount) > sourceBalance) {
      setToast({ type: 'error', text: `Insufficient ${bridgeToken} balance` })
      return
    }
    if (!bridgePreview) return
    setConfirmAction({
      title: 'Confirm bridge',
      lines: [
        { label: 'Direction', value: `${bridgeFrom === 'nara' ? 'Nara' : 'Solana'} -> ${bridgeFrom === 'nara' ? 'Solana' : 'Nara'}` },
        { label: 'Pay', value: `${bridgeAmount} ${bridgeToken}` },
        { label: 'Receive', value: `${trimAmount(unitsToNumber(bridgePreview.bridgeAmount, bridgePreview.cfg.decimals))} ${bridgeToken}` },
        { label: 'Fee', value: `${trimAmount(unitsToNumber(bridgePreview.feeAmount, bridgePreview.cfg.decimals))} ${bridgeToken}` },
      ],
      onConfirm: doBridge,
    })
  }

  async function doBridge() {
    setConfirmAction(null)
    setBridgeExecuting(true)
    setBridgeResult(null)
    try {
      const result = await executeBridge({ walletProvider, address, token: bridgeToken, fromChain: bridgeFrom, amount: bridgeAmount })
      setBridgeResult({ ok: true, chain: bridgeFrom, ...result })
      setBridgeAmount('')
      setToast({ type: 'success', text: 'Bridge transaction confirmed' })
      setTimeout(refreshBalances, 2500)
    } catch (error) {
      setBridgeResult({ ok: false, error: error.message || 'Bridge failed' })
    } finally {
      setBridgeExecuting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/tokens/nara.png" alt="" />
          <div>
            <span>Nara</span>
            <strong>Swap</strong>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="wallet-menu-wrap" onPointerDown={event => event.stopPropagation()}>
            <button
              type="button"
              className={`wallet-button ${isConnected ? 'connected' : ''}`}
              aria-expanded={accountMenuOpen}
              onClick={() => {
                if (!isConnected) {
                  open()
                  return
                }
                setAccountMenuOpen(value => !value)
              }}
            >
              {isConnected && <span className="connection-dot" aria-hidden="true" />}
              <span>{isConnected && address ? shortAddress(address) : 'Connect wallet'}</span>
              {isConnected && <span className="chevron">⌄</span>}
            </button>
            {isConnected && accountMenuOpen && (
              <div className="wallet-menu-panel" role="menu">
                <button type="button" role="menuitem" onClick={copyAddress}>Copy address</button>
                <button type="button" role="menuitem" className="danger" onClick={disconnectWallet}>Disconnect</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="trade-panel">
          <div className="panel-head">
            <div className="tab-switch" role="tablist" aria-label="Mode">
              <button className={activeTab === 'swap' ? 'active' : ''} type="button" onClick={() => setActiveTab('swap')}>Swap</button>
              <button className={activeTab === 'bridge' ? 'active' : ''} type="button" onClick={() => setActiveTab('bridge')}>Bridge</button>
            </div>
          </div>

          {activeTab === 'swap' ? (
            <div className="trade-card">
              <div className="input-block amount-block">
                <div className="input-label-row">
                  <span>You pay</span>
                  <button type="button" className="balance-button" onClick={setMaxSwap}>
                    Max
                  </button>
                </div>
                <div className="amount-row">
                  <input inputMode="decimal" placeholder="0.0" value={swapAmount} onChange={event => setSwapAmount(event.target.value)} />
                  <TokenDropdown
                    ariaLabel="From token"
                    tokens={NARA_TOKENS}
                    selectedIndex={fromIndex}
                    iconChain="nara"
                    onChange={next => {
                      setFromIndex(next)
                      if (next === toIndex) setToIndex(next === 0 ? 1 : 0)
                    }}
                  />
                </div>
                <span className="muted-line">Balance {formatAmount(balanceOf('nara', fromToken.symbol), 6)}</span>
              </div>

              <button className={`flip-button ${swapFlipAnimating ? 'spin' : ''}`} type="button" aria-label="Switch tokens" onClick={flipSwapTokens}>
                <FlipIcon />
              </button>

              <div className="input-block amount-block">
                <div className="input-label-row">
                  <span>You receive</span>
                  <span>{quoteLoading ? 'Quoting' : 'Estimated'}</span>
                </div>
                <div className="amount-row">
                  <output>{quoteLoading ? '...' : quoteOut == null ? '-' : trimAmount(quoteOut)}</output>
                  <TokenDropdown
                    ariaLabel="To token"
                    tokens={NARA_TOKENS}
                    selectedIndex={toIndex}
                    iconChain="nara"
                    onChange={next => {
                      setToIndex(next)
                      if (next === fromIndex) setFromIndex(next === 0 ? 1 : 0)
                    }}
                  />
                </div>
              </div>

              <div className="details-grid swap-details">
                <div><span>Rate</span><strong>{rate ? `1 ${fromToken.symbol} = ${trimAmount(rate)} ${toToken.symbol}` : '-'}</strong></div>
                <div><span>Minimum received</span><strong>{minOut ? `${trimAmount(minOut)} ${toToken.symbol}` : '-'}</strong></div>
                <div><span>Slippage</span><strong><select className="inline-select" value={slippage} onChange={event => setSlippage(Number(event.target.value))}>{[0.5, 1, 2, 3].map(v => <option key={v} value={v}>{v}%</option>)}</select></strong></div>
              </div>

              <button className="primary-button wide" type="button" disabled={swapExecuting || !quote} onClick={askSwap}>
                {swapExecuting ? 'Swapping...' : isConnected ? 'Swap on Nara' : 'Connect wallet'}
              </button>
            </div>
          ) : (
            <div className="trade-card">
              <div className="input-block amount-block">
                <div className="input-label-row">
                  <span>You send on {bridgeFrom === 'nara' ? 'Nara' : 'Solana'}</span>
                  <button type="button" className="balance-button" onClick={setMaxBridge}>Max</button>
                </div>
                <div className="amount-row">
                  <input inputMode="decimal" placeholder="0.0" value={bridgeAmount} onChange={event => setBridgeAmount(event.target.value)} />
                  <TokenDropdown
                    ariaLabel="Bridge token"
                    tokens={bridgeTokens}
                    selectedIndex={bridgeTokenIndex}
                    iconChain={bridgeFrom}
                    onChange={next => setBridgeToken(bridgeTokens[next].symbol)}
                  />
                </div>
                <span className={`muted-line ${bridgeTooSmall ? 'warning' : ''}`}>
                  Source balance {formatAmount(balanceOf(bridgeFrom, bridgeToken), 6)} · Min {bridgeMinimum == null ? '-' : `${trimAmount(bridgeMinimum)} ${bridgeToken}`}
                </span>
              </div>

              <button className={`flip-button ${bridgeFlipAnimating ? 'spin' : ''}`} type="button" aria-label="Switch bridge direction" onClick={flipBridgeDirection}>
                <FlipIcon />
              </button>

              <div className="input-block amount-block">
                <div className="input-label-row">
                  <span>You receive</span>
                  <span>{bridgeFrom === 'nara' ? 'Solana' : 'Nara'}</span>
                </div>
                <div className="amount-row">
                  <output>{bridgeReceive == null ? '-' : trimAmount(bridgeReceive)}</output>
                  <div className="select-wrap static-select">
                    <ChainTokenIcon symbol={bridgeToken} chain={bridgeFrom === 'nara' ? 'solana' : 'nara'} />
                    <span>{bridgeToken}</span>
                  </div>
                </div>
                <span className="muted-line">After bridge fee {bridgeFee == null ? '-' : `${trimAmount(bridgeFee)} ${bridgeToken}`}</span>
              </div>

              <div className="details-grid bridge-details">
                <div><span>Direction</span><strong>{bridgeFrom === 'nara' ? 'Nara -> Solana' : 'Solana -> Nara'}</strong></div>
                <div><span>Rate</span><strong>{bridgeRate ? `1 ${bridgeToken} = ${trimAmount(bridgeRate)} ${bridgeToken}` : '-'}</strong></div>
                <div><span>Fee</span><strong>{bridgeFee == null ? '-' : `${trimAmount(bridgeFee)} ${bridgeToken}`}</strong></div>
              </div>

              <button className="primary-button wide" type="button" disabled={bridgeExecuting || !bridgeAmount || bridgeTooSmall} onClick={askBridge}>
                {bridgeExecuting ? 'Bridging...' : bridgeTooSmall ? `Min ${trimAmount(bridgeMinimum)} ${bridgeToken}` : isConnected ? 'Bridge asset' : 'Connect wallet'}
              </button>
            </div>
          )}
        </div>

        <aside className="side-panel">
          <section className="status-card">
            <div className="status-heading">
              <span>Balances</span>
              <button type="button" onClick={refreshBalances}>{balancesLoading ? '...' : 'Refresh'}</button>
            </div>
            <div className="balance-groups">
              <section className="balance-group" aria-label="Nara balances">
                <div className="balance-group-title">
                  <span>Nara</span>
                  <small>Mainnet</small>
                </div>
                <div className="balance-list">
                  {NARA_TOKENS.map(token => (
                    <BalanceRow
                      key={`nara-${token.symbol}`}
                      chain="nara"
                      token={token}
                      value={balanceOf('nara', token.symbol)}
                    />
                  ))}
                </div>
              </section>

              <div className="balance-divider" aria-hidden="true" />

              <section className="balance-group" aria-label="Solana balances">
                <div className="balance-group-title">
                  <span>Solana</span>
                  <small>Mainnet</small>
                </div>
                <div className="balance-list">
                  <BalanceRow
                    chain="solana"
                    token={{ symbol: 'SOL' }}
                    value={balanceOf('solana', 'SOL')}
                  />
                  {BRIDGE_ASSETS.filter(asset => asset.symbol !== 'SOL').map(asset => (
                    <BalanceRow
                      key={`sol-${asset.symbol}`}
                      chain="solana"
                      token={asset}
                      value={balanceOf('solana', asset.symbol)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </section>

          {[swapResult, bridgeResult].filter(Boolean).slice(-1).map((result, index) => (
            <section className="status-card" key={index}>
              <div className="status-heading">
                <span>Latest</span>
                <strong>Activity</strong>
              </div>
              {result.ok ? (
                <div className="result-box success">
                  <span>Confirmed</span>
                  <a href={explorerUrl(result.signature, result.chain)} target="_blank" rel="noreferrer">{shortAddress(result.signature, 8, 8)}</a>
                  {result.messageId && <small>Message {shortAddress(result.messageId, 10, 8)}</small>}
                </div>
              ) : (
                <div className="result-box error">
                  <span>Failed</span>
                  <small>{result.error}</small>
                </div>
              )}
            </section>
          ))}
        </aside>
      </section>

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
      <ConfirmModal action={confirmAction} onCancel={() => setConfirmAction(null)} />
    </main>
  )
}
