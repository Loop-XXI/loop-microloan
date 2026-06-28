# Non-Custodial Collateral Architecture

Loop Microloan is intended to be a non-custodial Bitcoin microloan protocol for humans and autonomous agents.

## Core requirement

Users must not send BTC collateral into a Loop-controlled wallet as the final product design. Loop must not have unilateral access to user collateral.

The Phoenixd collateral flow used during initial testing was only a proof-of-movement prototype. It proved that the app can detect real Lightning payments and send real USDC, but it is not the final custody architecture.

## Product model

1. Borrower locks BTC collateral in a non-custodial contract.
2. Loop verifies the lock and disburses USDC from treasury liquidity.
3. Borrower repays principal + interest.
4. Contract releases collateral back to borrower on repayment.
5. If the borrower defaults or liquidation conditions are met, the contract permits the lender/protocol to claim only according to pre-agreed signed conditions.

## Candidate collateral mechanisms

### 1. Taproot script escrow

A Bitcoin output controlled by Taproot script paths:

- Cooperative close: borrower + lender sign to release collateral after repayment.
- Borrower refund path: borrower can reclaim after a timeout if USDC was not disbursed.
- Lender claim path: lender can claim after maturity/default according to pre-signed conditions.
- Liquidation path: oracle/DLC condition can authorize liquidation when LTV crosses threshold.

### 2. DLC-style loan contract

A Discreet Log Contract can encode price-dependent outcomes using oracle attestations. This is the strongest fit for non-custodial BTC-backed loans with margin/liquidation logic.

### 3. Lightning/HTLC proof layer

Lightning can be used for repayment, fees, and fast settlement notifications. Plain Phoenixd invoices are not sufficient for non-custodial collateral because once settled, the receiver controls funds.

## USDC side

USDC disbursement is treasury liquidity, not borrower collateral. The current Base USDC EVM rail can remain as the payout rail, but it must be paired with non-custodial BTC collateral before production release.

## Prototype warning

Any route, doc, or demo using Phoenixd to receive borrower collateral must be labeled as custodial prototype/test infrastructure only.

Production readiness requires replacing collateral custody with a user-protective contract layer.
