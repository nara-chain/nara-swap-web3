import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { NARA_ALT_ADDRESS } from './config.js'

export async function waitForConfirmation(connection, signature, timeoutMs = 45000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature])
    const status = value?.[0]
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return signature
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('Transaction confirmation timeout')
}

async function loadNaraAlt(connection) {
  try {
    const result = await connection.getAddressLookupTable(new PublicKey(NARA_ALT_ADDRESS))
    return result.value ? [result.value] : []
  } catch {
    return []
  }
}

export async function signAndSendInstructions({
  connection,
  payer,
  walletProvider,
  instructions,
  extraSigners = [],
  useNaraAlt = false,
  computeUnitLimit,
  computeUnitPrice,
  skipPreflight = false,
}) {
  if (!walletProvider?.signTransaction) throw new Error('Connected wallet does not support transaction signing')

  const budgetIxs = []
  if (computeUnitLimit) budgetIxs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }))
  if (computeUnitPrice) budgetIxs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }))
  const allInstructions = [...budgetIxs, ...instructions]

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const alts = useNaraAlt ? await loadNaraAlt(connection) : []
  let tx

  if (alts.length) {
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: allInstructions,
    }).compileToV0Message(alts)
    tx = new VersionedTransaction(message)
    if (extraSigners.length) tx.sign(extraSigners)
  } else {
    tx = new Transaction()
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = payer
    allInstructions.forEach(ix => tx.add(ix))
    if (extraSigners.length) tx.partialSign(...extraSigners)
  }

  const signed = await walletProvider.signTransaction(tx)
  const raw = signed.serialize()
  const signature = await connection.sendRawTransaction(raw, { skipPreflight })
  await waitForConfirmation(connection, signature)
  return signature
}
