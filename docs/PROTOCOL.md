# Loop Microloan Protocol Specification

A production-grade, open-source micro Bitcoin loan protocol for autonomous agents.

## Overview

Agents deposit sats via Lightning, receive USDC (off-chain ledger v1), pay interest until repayment or liquidation. The protocol is neutral — any operator can run an instance.

## Layer 2: Lightning Network

- **Collateral in:** BOLT11 Lightning invoices (sats)
- **Loan out:** USDC via stablecoin bridge (Liquid Network or off-chain ledger v1)
- **Interest:** accrues per-block or per-hour, charged in sats at repayment
- **Liquidation:** triggered by LTV threshold breach (BTC price drop)

**V1 Simplification:** USDC disbursement is off-chain ledger (Supabase) with manual settlement until volume justifies on-chain bridge. This reduces risk while proving the mechanism.

## Loan Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum deposit | 50,000 sats | Covers fees + meaningful collateral |
| Maximum deposit (v1) | 2,000,000 sats | Risk cap per loan |
| LTV at origination | 50% | Conservative entry |
| Liquidation LTV | 80% | Standard DeFi threshold |
| Margin call (warning) LTV | 70% | 10% buffer before liquidation |
| Interest rate | 18% APR / 0.00205% per hour | Competitive for collateralized lending |
| Min loan duration | 1 hour | Prevents fee arbitrage |
| Max loan duration | 90 days | Risk management |
| Liquidation penalty | 5% of collateral | Discourages gaming liquidation |
| Protocol fee | 0.5% of USDC disbursed at origination | Revenue to operator treasury |

## Interest Formula

```
hourly_rate = 0.18 / 8760          // 0.000020548 per hour
accrued_interest_sats = principal_sats * hourly_rate * hours_elapsed
total_repayment_sats = principal_sats + accrued_interest_sats
```

## LTV Calculation

```
current_ltv = loan_usd / (collateral_sats * btc_price_usd / 100_000_000)
```

## Liquidation Logic

```
IF current_ltv >= 0.80:
    liquidate immediately
    send collateral_sats to protocol treasury (minus any surplus to borrower)
    surplus_sats = collateral_value_usd - loan_usd - liquidation_penalty_usd
    IF surplus_sats > 0: refund to borrower wallet
    MARK loan status = LIQUIDATED

IF current_ltv >= 0.70:
    emit margin_call event
    send notification (Nostr DM or webhook)
    allow 24h to add collateral or repay
```

## BTC Price Feed

- **Primary:** Kraken `/0/public/Ticker?pair=XBTUSD`
- **Fallback:** Coinbase `/v2/prices/BTC-USD/spot`
- **Cache:** 60-second TTL
- **Rule:** take median of available feeds, never a single source
- **Health check:** if all feeds fail, FREEZE new loans, do NOT liquidate on stale price

## Constraints and Guard Rails

- Never liquidate on stale price (if price feed age > 5 minutes, halt liquidations)
- Never open new loans if Lightning node is unreachable
- All financial calculations use integer arithmetic in sats (no floats for money)
- All USDC amounts stored as NUMERIC(12,4) in Postgres (not float)
- Log every LTV check to `loans.last_ltv_check_at` for auditability
- Never store Lightning preimages in plaintext logs (payment_hash only)
- Rate limit loan creation: 5 per identifier per 24 hours (prevent spam)
- Hard cap: 10 active loans per borrower_identifier at any time

## License

MIT — see LICENSE file.
