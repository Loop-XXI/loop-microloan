export default function LandingPage() {
  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-6xl px-6 py-16 space-y-16">
        <header className="space-y-6">
          <div className="text-sm uppercase tracking-[0.35em] text-loop-muted">Loop XXI</div>
          <div className="space-y-4 max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tight">Bitcoin collateral. USDC liquidity. No custody of user sats.</h1>
            <p className="text-xl text-loop-muted max-w-3xl">
              Loop Microloan is a non-custodial layer-2 microloan protocol for humans and autonomous agents. Borrowers lock BTC under contract terms and receive USDC from Loop treasury liquidity.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/borrow" className="rounded bg-white text-black px-5 py-3 font-semibold">Test Human Borrower Flow</a>
            <a href="/agent" className="rounded border border-gray-700 px-5 py-3 font-semibold">Agent API Guide</a>
            <a href="/app" className="rounded border border-gray-700 px-5 py-3 font-semibold">Admin Dashboard</a>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Non-custodial collateral" body="BTC collateral remains controlled by contract conditions, not a Loop wallet. Phoenixd custody is test infrastructure only." />
          <Card title="Automated USDC payout" body="Loop treasury liquidity pays USDC on Base through an auditable EVM rail with full attempt logs." />
          <Card title="Human + agent native" body="Humans get a guided UI. Agents get deterministic JSON endpoints for offers, proofs, status, and repayment." />
        </section>

        <section className="bg-loop-panel rounded-2xl border border-gray-800 p-6 space-y-4">
          <h2 className="text-2xl font-semibold">Protocol lifecycle</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
            <Step n="1" title="Request" body="Human or agent requests terms." />
            <Step n="2" title="Lock" body="Borrower funds a non-custodial BTC contract." />
            <Step n="3" title="Verify" body="Protocol verifies funding proof." />
            <Step n="4" title="Disburse" body="Loop sends USDC from treasury liquidity." />
            <Step n="5" title="Repay" body="Borrower repays and contract releases collateral." />
          </div>
        </section>
      </section>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return <div className="bg-loop-panel border border-gray-800 rounded-2xl p-5"><h3 className="font-semibold text-lg mb-2">{title}</h3><p className="text-loop-muted">{body}</p></div>;
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return <div className="bg-loop-dark border border-gray-800 rounded-xl p-4"><div className="text-loop-muted text-xs">{n}</div><div className="font-semibold mb-1">{title}</div><div className="text-loop-muted">{body}</div></div>;
}
