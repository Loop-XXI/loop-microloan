# Loop Microloan — Agent Integration

Any autonomous agent can take a micro-loan against sats. No account required. No KYC.

## Flow

1. POST /api/v1/loans with your identifier and collateral amount
2. Pay the Lightning invoice returned in the response
3. USDC credit is recorded on your account (v1: off-chain ledger)
4. Poll GET /api/v1/loans/:id/status to monitor LTV
5. POST /api/v1/loans/:id/repay when ready → pay Lightning invoice → loan closed
6. If LTV hits 80%, liquidation is automatic — no action required

## Minimal agent code (TypeScript)

```typescript
async function openLoan(agentId: string, collateralSats: number) {
  const res = await fetch('https://api.loop.finance/api/v1/loans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      borrower_identifier: agentId,
      collateral_sats: collateralSats,
      identifier_type: 'agent_id'
    })
  })
  const { data } = await res.json()
  // data.collateral_invoice = BOLT11 to pay
  // Pay invoice via your Lightning wallet, then poll status
  return data
}
```

## API Reference

### POST /api/v1/loans

Open a new loan. Returns a Lightning invoice for collateral.

**Request:**
```json
{
  "borrower_identifier": "03abc...pubkey",
  "collateral_sats": 100000,
  "identifier_type": "lightning_pubkey" | "agent_id"
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "loan_id": "uuid",
    "status": "PENDING_COLLATERAL",
    "collateral_invoice": "lnbc...",
    "payment_hash": "abc123",
    "collateral_sats_required": 100000,
    "invoice_expires_at": "2026-06-27T12:00:00Z",
    "estimated_loan_usd": "28.50",
    "protocol_fee_usd": "0.14",
    "ltv_at_origination": 0.50,
    "btc_price_used": "57000.00",
    "message": "Pay the Lightning invoice to activate your loan. Invoice expires in 1 hour."
  }
}
```

### GET /api/v1/loans/:id/status

Poll loan status. Must be checked before repayment.

**Response when ACTIVE:**
```json
{
  "success": true,
  "data": {
    "loan_id": "uuid",
    "status": "ACTIVE",
    "collateral_sats": 100000,
    "principal_usd": "28.50",
    "current_btc_price": "56200.00",
    "current_ltv": 0.5107,
    "accrued_interest_sats": 42,
    "total_repayment_sats": 100042,
    "hours_active": 1.2,
    "loan_opened_at": "2026-06-27T10:00:00Z",
    "expires_at": "2026-09-25T10:00:00Z",
    "margin_call_ltv": 0.70,
    "liquidation_ltv": 0.80
  }
}
```

### POST /api/v1/loans/:id/repay

Initiate repayment. Returns a Lightning invoice for total repayment (principal + accrued interest).

**Response:**
```json
{
  "success": true,
  "data": {
    "repayment_invoice": "lnbc...",
    "repayment_sats": 100145,
    "breakdown": {
      "principal_sats": 100000,
      "interest_sats": 145,
      "hours_active": 7.05
    },
    "invoice_expires_at": "2026-06-27T20:00:00Z"
  }
}
```

## Constraints

- Max 10 active loans per `borrower_identifier`
- Max 5 loan requests per identifier per 24h
- Minimum collateral: 50,000 sats
- Maximum collateral: 2,000,000 sats
- Loan duration: 1 hour minimum, 90 days maximum
- Liquidation is automatic at 80% LTV; no action required from borrower
