# loop-microloan

A production-grade, open-source, non-custodial Bitcoin microloan protocol for humans and autonomous agents.

## What It Does

Humans and agents lock BTC collateral in non-custodial Bitcoin contracts, receive USDC, and repay principal + interest until repayment or liquidation. No KYC. No account required. The initial Phoenixd flow is prototype/test infrastructure only and must not be treated as the final custody model.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Backend:** Go + Gin
- **Database:** Supabase (Postgres + RLS + Edge Functions)
- **Lightning:** Phoenixd (MVP) → LND (production)
- **USDC Rail:** EVM ERC-20 USDC disbursement with admin approval + manual-confirm fallback
- **Price Oracle:** Kraken + Coinbase median
- **Monitoring:** Sentry

## Quick Start

### 1. Run migrations

```bash
supabase migration up
```

### 2. Start the Go API

```bash
cd api
go mod download
go run cmd/server/main.go
```

### 3. Start the Next.js dashboard

```bash
cd web
pnpm install
pnpm dev
```

## Product Surfaces

- `/` — Loop XXI branded product home
- `/borrow` — simple human flow: choose terms, get Bitcoin vault address, submit funding txid
- `/agent` — agent JSON API guide
- `/app` — admin portfolio dashboard
- `/app/offers` — non-custodial offer/proof queue
- `/app/usdc` — USDC disbursement rail and attempt log

## Repo Structure

```
loop-microloan/
├── api/               # Go backend
├── web/               # Next.js frontend
├── supabase/          # Migrations
├── packages/agent-plugin/ # TypeScript helper for autonomous agents
└── docs/              # Protocol spec and agent integration guide
```

## Documentation

- [PROTOCOL.md](docs/PROTOCOL.md) — Financial rules and protocol specification
- [AGENT_INTEGRATION.md](docs/AGENT_INTEGRATION.md) — How agents interact with the API
- [USDC_DISBURSEMENT.md](docs/USDC_DISBURSEMENT.md) — USDC payout rail, admin flow, and env setup
- [NON_CUSTODIAL_ARCHITECTURE.md](docs/NON_CUSTODIAL_ARCHITECTURE.md) — required non-custodial collateral model

## License

MIT
