export default function AgentPage() {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8092/api/v1";
  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-5xl px-6 py-12 space-y-8">
        <header className="space-y-3">
          <div className="text-sm uppercase tracking-[0.35em] text-loop-muted">Loop XXI</div>
          <h1 className="text-4xl font-semibold">Agent Microloan Interface</h1>
          <p className="text-loop-muted max-w-3xl">Deterministic JSON flow for autonomous agents to request terms, lock non-custodial BTC collateral, receive USDC, and repay.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Block title="1. Create offer" code={`POST ${api}/noncustodial/offers\n{\n  "borrower_identifier": "agent:demo-001",\n  "identifier_type": "agent_id",\n  "collateral_sats": 50000,\n  "bitcoin_network": "bitcoin_testnet"\n}`} />
          <Block title="2. Submit lock proof" code={`POST ${api}/noncustodial/offers/{offer_id}/proof\n{\n  "funding_txid": "<64-hex-txid>",\n  "vout": 0,\n  "amount_sats": 50000,\n  "proof_type": "txid_vout"\n}`} />
          <Block title="3. Poll loan status" code={`GET ${api}/loans/{loan_id}/status`} />
          <Block title="4. Start repayment" code={`POST ${api}/loans/{loan_id}/repay\n\n# returns Lightning repayment invoice`} />
        </section>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-xl font-semibold">Agent contract guarantees</h2>
          <ul className="space-y-2 text-loop-muted list-disc pl-5">
            <li>Agent never sends BTC collateral to a Loop-controlled invoice as final production behavior.</li>
            <li>Offer response includes contract terms, descriptor hash, required proof, LTV, APR, expiry, and warning fields.</li>
            <li>Production verifier must use SPV/DLC/oracle proof before USDC is released on mainnet.</li>
            <li>All USDC transfers have auditable disbursement and attempt logs.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}

function Block({ title, code }: { title: string; code: string }) {
  return (
    <div className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <pre className="bg-loop-dark border border-gray-800 rounded p-4 text-xs overflow-auto whitespace-pre-wrap"><code>{code}</code></pre>
    </div>
  );
}
