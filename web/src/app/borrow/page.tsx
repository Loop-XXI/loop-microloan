"use client";

import { useMemo, useState } from "react";
import { createNoncustodialOffer, submitCollateralProof } from "@/lib/api";

const DEMO_BORROWER_PUBKEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export default function BorrowPage() {
  const [borrower, setBorrower] = useState("human-demo-user");
  const [collateralSats, setCollateralSats] = useState(50000);
  const [network, setNetwork] = useState("bitcoin_testnet");
  const [offer, setOffer] = useState<any>(null);
  const [fundingTxid, setFundingTxid] = useState("");
  const [vout, setVout] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const estimate = useMemo(() => {
    const btcPrice = 60000;
    const principal = (collateralSats / 100_000_000) * btcPrice * 0.5;
    return { principal, fee: principal * 0.005 };
  }, [collateralSats]);

  async function createVault() {
    setLoading(true);
    setMessage(null);
    setOffer(null);
    const res = await createNoncustodialOffer({
      borrower_identifier: borrower,
      identifier_type: "human",
      collateral_sats: collateralSats,
      bitcoin_network: network,
      borrower_pubkey: DEMO_BORROWER_PUBKEY,
    });
    setLoading(false);
    if (!res.success) return setMessage(res.error || "Could not create vault");
    setOffer(res.data);
    setMessage("Vault created. Send the exact BTC collateral to the address below, then paste the transaction ID.");
  }

  async function submitTx() {
    if (!offer?.id) return;
    setLoading(true);
    setMessage(null);
    const res = await submitCollateralProof(offer.id, {
      funding_txid: fundingTxid,
      vout,
      amount_sats: collateralSats,
      proof_type: "txid_vout",
    });
    setLoading(false);
    if (!res.success) return setMessage(res.error || "Could not submit transaction");
    setMessage("Transaction submitted. Loan waits for Bitcoin verification before USDC release.");
    setOffer(res.data.offer);
  }

  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <header className="space-y-3">
          <div className="text-sm uppercase tracking-[0.3em] text-loop-muted">Loop XXI</div>
          <h1 className="text-4xl font-semibold tracking-tight">Borrow USDC against Bitcoin</h1>
          <p className="text-loop-muted text-lg">Keep custody of your sats. Lock BTC in a verifiable Bitcoin vault, then receive USDC after the vault transaction confirms.</p>
        </header>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">1. Choose terms</h2>
            <div className="text-sm text-loop-muted">50% LTV · 18% APR</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-sm text-loop-muted">Name or agent label</span><input value={borrower} onChange={(e) => setBorrower(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">BTC collateral</span><input type="number" min={50000} max={2000000} value={collateralSats} onChange={(e) => setCollateralSats(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">Network</span><select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2"><option value="bitcoin_testnet">Bitcoin testnet</option><option value="mutinynet">Mutinynet</option><option value="bitcoin_mainnet">Bitcoin mainnet</option></select></label>
            <div className="grid grid-cols-2 gap-3"><Stat label="USDC available" value={`$${estimate.principal.toFixed(2)}`} /><Stat label="Fee" value={`$${estimate.fee.toFixed(2)}`} /></div>
          </div>
          <button onClick={createVault} disabled={loading} className="w-full rounded bg-white text-black font-semibold px-4 py-3 disabled:opacity-40">{loading ? "Working..." : "Create Bitcoin vault"}</button>
        </section>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xl font-semibold">2. Fund vault</h2>
          {!offer ? <p className="text-loop-muted">Create a vault first. You will get one Bitcoin address to fund.</p> : (
            <div className="space-y-4">
              <div className="rounded-xl bg-loop-dark border border-gray-800 p-4">
                <div className="text-sm text-loop-muted mb-1">Send exactly</div>
                <div className="text-2xl font-mono">{Number(offer.collateral_sats).toLocaleString()} sats</div>
              </div>
              <div className="rounded-xl bg-loop-dark border border-gray-800 p-4">
                <div className="text-sm text-loop-muted mb-1">Vault address</div>
                <div className="text-lg font-mono break-all">{offer.contract_terms?.collateral_address}</div>
              </div>
              <div className="rounded-xl border border-green-900/60 bg-green-950/20 p-4 text-sm text-green-200">This is a Bitcoin contract address. Loop cannot spend it alone.</div>
            </div>
          )}
        </section>

        <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xl font-semibold">3. Submit transaction</h2>
          <p className="text-sm text-loop-muted">Paste the Bitcoin transaction ID after funding the vault. USDC is released only after verification.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="md:col-span-3 space-y-1"><span className="text-sm text-loop-muted">Funding txid</span><input value={fundingTxid} onChange={(e) => setFundingTxid(e.target.value)} placeholder="64 hex characters" className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2 font-mono" /></label>
            <label className="space-y-1"><span className="text-sm text-loop-muted">vout</span><input type="number" value={vout} onChange={(e) => setVout(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" /></label>
          </div>
          <button onClick={submitTx} disabled={!offer || !fundingTxid || loading} className="w-full rounded bg-loop-accent text-black font-semibold px-4 py-3 disabled:opacity-40">Submit for verification</button>
          {message && <div className="rounded border border-gray-800 bg-loop-dark p-3 text-sm text-loop-muted">{message}</div>}
          {offer?.status && <Stat label="Current status" value={offer.status} />}
        </section>

        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-loop-muted underline">{showAdvanced ? "Hide" : "Show"} advanced details</button>
        {showAdvanced && (
          <section className="bg-loop-panel border border-gray-800 rounded-2xl p-5 space-y-3 text-sm">
            <div><span className="text-loop-muted">Demo borrower public key:</span><div className="font-mono break-all">{DEMO_BORROWER_PUBKEY}</div></div>
            <div className="text-yellow-200">Demo key is for address-generation testing only. Production should connect a wallet and sign PSBTs instead of using this key.</div>
            <div className="text-loop-muted">Lightning is best for repayment UX. It is not durable collateral for 90-day loans.</div>
          </section>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-loop-dark border border-gray-800 p-3"><div className="text-xs text-loop-muted">{label}</div><div className="font-mono text-lg break-all">{value}</div></div>; }
