# Loop Microloan Product Layer

Loop Microloan is a Loop XXI branded product layer for Bitcoin-backed liquidity.

## Scope

This repo is not trying to rebuild Surge, Firefish, or a full Bitcoin credit protocol. It is a small product surface that can sit on top of existing Bitcoin-backed credit infrastructure.

## Product surfaces

- Human UI: explain the loan, collect borrower intent, route to a provider/partner flow.
- Agent plugin: let agents create a structured liquidity request that a provider adapter can fulfill.

## Design principle

Keep user BTC non-custodial. Loop XXI should not hold borrower sats. Collateral should be locked by the underlying provider/protocol, such as a Taproot vault or Bitcoin smart contract system.

## Next integration seam

Add provider adapters as real APIs become available:

- Surge-style Bitcoin vault credit market
- Firefish-style Bitcoin-backed loan marketplace
- Future Lightning/Ark/Liquid L2 microloan provider for short-duration agent credit
