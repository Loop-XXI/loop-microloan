# USDC Disbursement Rail

Loop Microloan v1 now separates BTC collateral from USDC payout state.

## Flow

1. Borrower deposits sats into a Phoenixd Lightning invoice.
2. Loan becomes `ACTIVE` after the collateral invoice is paid.
3. A `usdc_disbursements` row is created for the principal amount.
4. Borrower enters a USDC recipient network/address in the user dashboard.
5. Disbursement moves from `PENDING` to `READY`.
6. Admin reviews the queue in `/app/usdc`.
7. Admin sends via EVM ERC-20 USDC rail or records a manual payout.
8. Attempts are logged in `usdc_disbursement_attempts`.
9. Disbursement status becomes `SENT` or `CONFIRMED`.

## Supported EVM Networks

- Base, chain id `8453`, native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Ethereum, chain id `1`, USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- Polygon, chain id `137`, native USDC `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`
- Arbitrum, chain id `42161`, native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`

## Environment

For real EVM transfers, configure:

```bash
USDC_EVM_PRIVATE_KEY=...
USDC_EVM_RPC_URL=...
```

Optional network-specific RPC overrides:

```bash
USDC_BASE_RPC_URL=...
USDC_ETHEREUM_RPC_URL=...
USDC_POLYGON_RPC_URL=...
USDC_ARBITRUM_RPC_URL=...
```

Optional contract override:

```bash
USDC_EVM_CONTRACT_ADDRESS=...
```

## Local real-data bridge

The sandbox kills the compiled Go server, so the real-data test bridge is available at:

```bash
tools/real-api-bridge.js
```

Run it with real Supabase/Phoenixd env vars:

```bash
PORT=8092 node tools/real-api-bridge.js
```

Run the UI against it:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8092/api/v1 npm run build
NEXT_PUBLIC_API_URL=http://localhost:8092/api/v1 npm run start -- -p 3006
```

## Safety

The rail refuses to send USDC unless:

- the loan is `ACTIVE`
- a supported network is selected
- a valid EVM recipient address is set
- a treasury RPC URL and private key are configured
- the treasury wallet has enough USDC

Every requested, sent, confirmed, and failed payout is stored in `usdc_disbursement_attempts`.
