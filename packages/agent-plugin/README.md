# Loop Microloan Agent Plugin

Minimal TypeScript helper for agents that want USDC liquidity against Bitcoin collateral.

```ts
import { createLoopMicroloanPlugin } from './loopMicroloanPlugin'

const loop = createLoopMicroloanPlugin({
  apiBase: 'http://localhost:8096/api/v1',
  borrowerIdentifier: 'agent:my-agent-001',
  borrowerPubkey: '02...compressed-secp256k1-pubkey',
})

const offer = await loop.createVault({ collateralSats: 50_000, bitcoinNetwork: 'bitcoin_testnet' })
console.log(offer.contract_terms.collateral_address)

// Agent funds that address from its Bitcoin wallet, then submits proof:
await loop.submitFundingProof({
  offerId: offer.id,
  fundingTxid: '<txid>',
  vout: 0,
  amountSats: 50_000,
})

// After verifier opens the loan:
await loop.setUSDCRecipient({
  loanId: '<loan-id>',
  network: 'base',
  recipientAddress: '0x...',
})
```

The plugin never asks the agent to send BTC to Loop. It returns a Bitcoin collateral vault address and waits for verifier approval before USDC disbursement.
