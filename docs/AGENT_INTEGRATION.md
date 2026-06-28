# Loop Microloan — Agent Integration

Loop Microloan exposes a deterministic JSON interface for autonomous agents that need short-duration USDC liquidity against Bitcoin collateral.

## Non-custodial rule

Agents must not send BTC collateral to a Loop-controlled Lightning invoice as the production collateral model. Collateral is locked in a user/agent-controlled Bitcoin contract. Loop verifies the lock and pays USDC from treasury liquidity.

The old Phoenixd collateral flow is test infrastructure only.

## Flow

1. Agent requests a non-custodial collateral offer.
2. Agent wallet funds the returned Bitcoin contract terms.
3. Agent submits funding proof.
4. Protocol verifier accepts the proof and opens the loan. Proof submission alone never releases USDC.
5. Loop USDC rail disburses funds to the configured recipient after verification.
6. Agent polls status and repays when ready.
7. Contract releases collateral according to repayment/default conditions.

## Minimal TypeScript client

```typescript
const API = 'https://api.loop.finance/api/v1'

export async function requestOffer(agentId: string, collateralSats: number) {
  const res = await fetch(`${API}/noncustodial/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      borrower_identifier: agentId,
      identifier_type: 'agent_id',
      collateral_sats: collateralSats,
      bitcoin_network: 'bitcoin_mainnet'
    })
  })
  return res.json()
}

export async function submitProof(offerId: string, proof: {
  funding_txid: string
  vout: number
  amount_sats: number
}) {
  const res = await fetch(`${API}/noncustodial/offers/${offerId}/proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...proof, proof_type: 'txid_vout' })
  })
  return res.json()
}

export async function getLoanStatus(loanId: string) {
  const res = await fetch(`${API}/loans/${loanId}/status`)
  return res.json()
}
```

## API Reference

### POST `/api/v1/noncustodial/offers`

Creates a non-custodial collateral contract offer.

Request:

```json
{
  "borrower_identifier": "agent:demo-001",
  "identifier_type": "agent_id",
  "collateral_sats": 50000,
  "bitcoin_network": "bitcoin_mainnet"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "offer-uuid",
    "status": "OFFERED",
    "collateral_sats": "50000",
    "principal_usd": "15.0000",
    "protocol_fee_usd": "0.0750",
    "contract_type": "taproot_escrow_v0",
    "bitcoin_network": "bitcoin_mainnet",
    "contract_terms": {
      "custody": "non_custodial",
      "descriptor_hash": "0x...",
      "proof_required": {
        "funding_txid": "64-character transaction id funding the borrower-controlled contract output",
        "vout": "output index of the contract UTXO",
        "amount_sats": 50000
      },
      "warning": "v0 test interface. Production requires SPV/DLC verification before USDC release."
    }
  }
}
```

### POST `/api/v1/noncustodial/offers/:id/proof`

Submits contract funding proof.

Request:

```json
{
  "funding_txid": "0000000000000000000000000000000000000000000000000000000000000001",
  "vout": 0,
  "amount_sats": 50000,
  "proof_type": "txid_vout"
}
```

Response after proof submission:

```json
{
  "success": true,
  "message": "Collateral proof submitted. Loan and USDC release are waiting for verifier approval.",
  "data": {
    "offer": { "status": "LOCK_PROOF_SUBMITTED" },
    "loan": null,
    "usdc": null
  }
}
```

### POST `/api/v1/noncustodial/offers/:id/verify`

Verifier-only endpoint. Opens the loan after the non-custodial BTC lock is verified.

```json
{
  "verification_evidence": {
    "method": "spv_or_dlc_verifier",
    "confirmations": 1
  }
}
```

### POST `/api/v1/loans/:id/usdc/recipient`

Sets the USDC recipient.

```json
{
  "network": "base",
  "recipient_address": "0x..."
}
```

### GET `/api/v1/loans/:id/status`

Polls loan state, LTV, accrued interest, repayment amount, and USDC disbursement state.

### POST `/api/v1/loans/:id/repay`

Creates a Lightning repayment invoice for principal + accrued interest.

## Constraints

- Minimum collateral: 50,000 sats
- Maximum collateral: 2,000,000 sats
- LTV at origination: 50%
- Margin call: 70%
- Liquidation threshold: 80%
- APR: 18%
- Protocol fee: 0.5% of principal

## Production verifier requirement

The bridge no longer auto-opens loans from submitted txids. A verifier step is required. Mainnet production must use SPV, DLC, or equivalent contract verification before USDC is released.
