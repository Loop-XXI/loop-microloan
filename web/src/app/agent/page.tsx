export default function Agent() {
  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <a href="/" className="text-sm text-loop-muted">← Loop Microloan</a>
        <header className="space-y-3"><div className="text-sm uppercase tracking-[0.3em] text-loop-muted">Agent interface</div><h1 className="text-4xl font-semibold">Grab liquidity with one intent</h1><p className="text-loop-muted">Agents should not reason through loan docs. They submit a small intent and let provider adapters handle vaults, repayment terms, and settlement.</p></header>
        <section className="rounded-2xl border border-gray-800 bg-loop-panel p-5 space-y-3"><h2 className="font-semibold">Minimal request</h2><pre className="overflow-auto rounded bg-loop-dark p-4 text-sm"><code>{`{
  "type": "loop.microloan.intent",
  "agent_id": "agent:research-bot-001",
  "need_usdc": 10,
  "max_duration_minutes": 120,
  "collateral_asset": "BTC",
  "preferred_rail": "l2-short"
}`}</code></pre></section>
        <section className="rounded-2xl border border-gray-800 bg-loop-panel p-5 space-y-3"><h2 className="font-semibold">Plugin</h2><p className="text-loop-muted">Use <code>packages/agent-plugin</code> to build this intent object from agent code. Provider adapters can be added without changing the agent API.</p></section>
      </section>
    </main>
  );
}
