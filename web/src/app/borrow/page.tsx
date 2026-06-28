"use client";

import { useMemo, useState } from "react";
import { createNoncustodialOffer, submitCollateralProof } from "@/lib/api";

export default function BorrowPage() {
  const [borrower, setBorrower] = useState("human-demo-user");
  const [collateralSats, setCollateralSats] = useState(50000);
  const [network, setNetwork] = useState("bitcoin_testnet");
  const [borrowerPubkey, setBorrowerPubkey] = useState("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
  const [offer, setOffer] = useState<any>(null);
  const [proofResult, setProofResult] = useState<any>(null);
  const [fundingTxid, setFundingTxid] = useState("");
  const [vout, setVout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const estimate = useMemo(() => {
    const btcPrice = 60000;
    const principal = (collateralSats / 100_000_000) * btcPrice * 0.5;
    return { principal };
  }, [collateralSats]);

  async function requestOffer() {
    setLoading(true);
    setMessage(null);
    setProofResult(null);
    const res = await createNoncustodialOffer({ borrower_identifier: borrower, identifier_type: "human", collateral_sats: collateralSats, bitcoin_network: network, borrower_pubkey: borrowerPubkey });
    setLoading(false);
    if (!res.success) return setMessage(res.error || "Offer request failed");
    setOffer(res.data);
    setMessage("Offer created. Next, lock BTC in the specified non-custodial contract from your own wallet.");
  }

  async function submitProof() {
    if (!offer?.id) return;
    setLoading(true);
    setMessage(null);
    const res = await submitCollateralProof(offer.id, { funding_txid: fundingTxid, vout, amount_sats: collateralSats, proof_type: "txid_vout", notes: "Human borrower submitted non-custodial lock proof" });
    setLoading(false);
    if (!res.success) return setMessage(res.error || "Proof submission failed");
    setProofResult(res.data);
    setMessage(res.message || "Proof submitted and waiting for verifier approval.");
  }

  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <header className="space-y-3">
          <div className="text-sm uppercase tracking-[0.3em] text-loop-muted">Loop XXI</div>
          <h1 className="text-4xl font-semibold tracking-tight">Borrow USDC without giving up custody of your sats</h1>
          <p className="text-loop-muted text-lg">Create a collateral offer, lock BTC from your own wallet, submit proof, then receive USDC after verifier approval.</p>
        </header>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <Step n="1" title="Request loan terms" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-sm text-loop-muted">Name or agent label</span><input value={borrower} onChange={(e) => setBorrower(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">Collateral sats</span><input type="number" min={50000} max={2000000} value={collateralSats} onChange={(e) => setCollateralSats(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">Bitcoin network</span><select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2"><option value="bitcoin_testnet">Bitcoin testnet</option><option value="mutinynet">Mutinynet</option><option value="bitcoin_regtest">Regtest</option><option value="bitcoin_mainnet">Bitcoin mainnet</option></select></label>
            <div className="grid grid-cols-2 gap-3"><Stat label="Estimated USDC" value={`$${estimate.principal.toFixed(2)}`} /><Stat label="APR" value="18%" /></div>
            <label className="space-y-1 md:col-span-2"><span className="text-sm text-loop-muted">Your Bitcoin public key</span><input value={borrowerPubkey} onChange={(e) => setBorrowerPubkey(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2 font-mono" /><span className="text-xs text-loop-muted">Paste a compressed secp256k1 public key from your wallet. The default is test-only and not safe for real funds.</span></label>
          </div>
          <button onClick={requestOffer} disabled={loading || !borrower} className="rounded bg-white text-black font-semibold px-4 py-2 disabled:opacity-40">{loading ? "Working..." : "Create offer"}</button>
        </section>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <Step n="2" title="Lock BTC from your wallet" />
          {!offer ? <p className="text-loop-muted">Create an offer first. No sats are sent to Loop.</p> : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Stat label="Offer status" value={offer.status} /><Stat label="Required collateral" value={`${Number(offer.collateral_sats).toLocaleString()} sats`} /><Stat label="USDC available" value={`$${Number(offer.principal_usd).toFixed(2)}`} /></div>
              <div className="rounded-lg bg-loop-dark border border-gray-800 p-4 space-y-2"><div><div className="text-sm text-loop-muted mb-1">Fund this collateral address</div><div className="font-mono text-sm break-all">{offer.contract_terms?.collateral_address}</div></div><div><div className="text-sm text-loop-muted mb-1">Contract package hash</div><div className="font-mono text-sm break-all">{offer.contract_terms?.descriptor_hash}</div></div></div>
              <div className="rounded-lg border border-gray-800 p-4 text-sm text-loop-muted">Production path: wallet creates/funds a Taproot/DLC-style collateral output matching this offer. Lightning can be used for repayment, but durable collateral should be Bitcoin script/DLC, not a custodial Lightning invoice.</div>
            </div>
          )}
        </section>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <Step n="3" title="Submit lock proof" />
          <p className="text-loop-muted text-sm">Submitting proof does not release USDC by itself. The verifier must confirm the lock before a loan is opened.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="md:col-span-3 space-y-1"><span className="text-sm text-loop-muted">Funding transaction ID</span><input value={fundingTxid} onChange={(e) => setFundingTxid(e.target.value)} placeholder="64 hex characters" className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2 font-mono" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">Output index</span><input type="number" value={vout} onChange={(e) => setVout(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
          </div>
          <button onClick={submitProof} disabled={!offer || loading || !fundingTxid} className="rounded bg-loop-accent text-black font-semibold px-4 py-2 disabled:opacity-40">Submit proof for verification</button>
          {message && <div className="rounded border border-gray-800 bg-loop-dark p-3 text-sm text-loop-muted">{message}</div>}
          {proofResult?.offer && <Stat label="Current offer status" value={proofResult.offer.status} />}
        </section>

        <section className="rounded-2xl border border-yellow-900/60 bg-yellow-950/20 p-5 text-yellow-100 space-y-2">
          <h2 className="font-semibold">Reality check on Lightning collateral</h2>
          <p className="text-sm">A hold invoice can temporarily encumber Lightning liquidity, but it is not durable 90-day non-custodial loan collateral. For real collateral, use Bitcoin script/DLC/Taproot contracts, then use Lightning for repayment and fast payment UX.</p>
        </section>
      </section>
    </main>
  );
}

function Step({ n, title }: { n: string; title: string }) { return <div><div className="text-xs text-loop-muted">Step {n}</div><h2 className="text-xl font-semibold">{title}</h2></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-loop-dark border border-gray-800 p-3"><div className="text-xs text-loop-muted">{label}</div><div className="font-mono text-lg break-all">{value}</div></div>; }
