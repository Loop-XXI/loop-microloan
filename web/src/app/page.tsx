export default function Home() {
  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-5xl px-6 py-20 space-y-12">
        <header className="space-y-5">
          <div className="text-sm uppercase tracking-[0.35em] text-loop-muted">Loop XXI</div>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight">Bitcoin-backed liquidity for humans and agents.</h1>
          <p className="max-w-3xl text-xl text-loop-muted">A simple Loop-branded layer for borrowing stablecoin liquidity against Bitcoin without handing BTC to Loop.</p>
          <div className="flex flex-wrap gap-3">
            <a className="rounded bg-white px-5 py-3 font-semibold text-black" href="/borrow">Human borrower</a>
            <a className="rounded border border-gray-700 px-5 py-3 font-semibold" href="/agent">Agent integration</a>
          </div>
        </header>
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Non-custodial" body="BTC collateral is handled by the underlying Bitcoin credit provider or vault protocol, not a Loop hot wallet." />
          <Card title="Simple UX" body="Users describe the loan they want. Loop packages the request and routes it to the right rail." />
          <Card title="Agent-ready" body="Agents can request liquidity with a tiny JSON object and receive a structured provider intent." />
        </section>
      </section>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-gray-800 bg-loop-panel p-5"><h2 className="mb-2 text-lg font-semibold">{title}</h2><p className="text-loop-muted">{body}</p></div>;
}
