# loop-microloan

Loop XXI branded Bitcoin-backed microloan product layer for humans and agents.

This repo is intentionally small. It does not attempt to recreate a full lending protocol. It provides a clean user interface and agent plugin that can route borrowers into real Bitcoin-backed credit infrastructure while keeping BTC collateral non-custodial.

## Surfaces

- `/` — product home
- `/borrow` — simple human borrower intake
- `/agent` — agent integration guide
- `packages/agent-plugin` — TypeScript helper for autonomous agents

## Principle

Borrowers should not send BTC to a Loop-controlled wallet. Collateral belongs in provider/protocol controlled non-custodial vaults, such as Taproot vaults or Bitcoin smart contracts.

## Run locally

```bash
cd web
npm install
npm run dev
```

## Docs

- [PRODUCT.md](docs/PRODUCT.md)

## License

MIT
