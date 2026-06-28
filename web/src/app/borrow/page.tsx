"use client";

import { useMemo, useState } from "react";

export default function Borrow() {
  const [btcSats, setBtcSats] = useState(100000);
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState("bitcoin");
  const [created, setCreated] = useState(false);
  const estimate = useMemo(() => {
    const btcUsd = 60000;
    const collateralUsd = (btcSats / 100_000_000) * btcUsd;
    return { credit: collateralUsd * 0.5, collateralUsd };
  }, [btcSats]);
  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <a href="/" className="text-sm text-loop-muted">← Loop Microloan</a>
        <header className="space-y-3">
          <div className="text-sm uppercase tracking-[0.3em] text-loop-muted">Human borrower</div>
          <h1 className="text-4xl font-semibold">Borrow against Bitcoin</h1>
          <p className="text-loop-muted">Tell us how much BTC collateral you want to use. Loop prepares a non-custodial loan request and routes it to a Bitcoin-backed credit provider.</p>
        </header>
        <section className="rounded-2xl border border-gray-800 bg-loop-panel p-5 space-y-4">
          <label className="block space-y-1"><span className="text-sm text-loop-muted">BTC collateral, sats</span><input className="w-full rounded border border-gray-700 bg-loop-dark px-3 py-2" type="number" min={1000} value={btcSats} onChange={(e)=>setBtcSats(Number(e.target.value))}/></label>
          <label className="block space-y-1"><span className="text-sm text-loop-muted">Preferred rail</span><select className="w-full rounded border border-gray-700 bg-loop-dark px-3 py-2" value={network} onChange={(e)=>setNetwork(e.target.value)}><option value="bitcoin">Bitcoin mainchain vault</option><option value="l2-short">L2 short-duration agent rail</option><option value="liquid">Liquid, if provider supports it</option></select></label>
          <label className="block space-y-1"><span className="text-sm text-loop-muted">Email or contact</span><input className="w-full rounded border border-gray-700 bg-loop-dark px-3 py-2" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <div className="grid grid-cols-2 gap-3"><Stat label="Collateral value" value={`$${estimate.collateralUsd.toFixed(2)}`} /><Stat label="Estimated credit" value={`$${estimate.credit.toFixed(2)}`} /></div>
          <button onClick={()=>setCreated(true)} className="w-full rounded bg-white px-4 py-3 font-semibold text-black">Create loan request</button>
        </section>
        {created && <section className="rounded-2xl border border-green-900/60 bg-green-950/20 p-5 space-y-2"><h2 className="font-semibold text-green-200">Request created</h2><p className="text-sm text-green-100">Loop would now route this to a provider adapter. No BTC has moved. No custody has changed.</p><pre className="overflow-auto rounded bg-loop-dark p-3 text-xs">{JSON.stringify({ type: "loop.microloan.intent", btc_sats: btcSats, estimated_credit_usd: Number(estimate.credit.toFixed(2)), preferred_rail: network, contact: email || null }, null, 2)}</pre></section>}
      </section>
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-gray-800 bg-loop-dark p-3"><div className="text-xs text-loop-muted">{label}</div><div className="font-mono text-xl">{value}</div></div>; }
