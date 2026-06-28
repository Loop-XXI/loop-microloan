# Loop Microloan Agent Plugin

Small helper for agents to express a Bitcoin-backed liquidity need without depending on a specific lender API.

```ts
import { createMicroloanIntent, toProviderRequest } from './loopMicroloanPlugin'

const intent = createMicroloanIntent({
  agent_id: 'agent:research-bot-001',
  need_usdc: 10,
  max_duration_minutes: 120,
  preferred_rail: 'l2-short',
})

const providerRequest = toProviderRequest(intent)
```

Provider adapters can map this request to Surge-style vaults, Firefish-style loans, Liquid rails, or future Lightning/Ark L2 microloan rails.
