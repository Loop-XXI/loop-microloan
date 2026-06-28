"use client";

import { useMemo, useState } from "react";
import { createNoncustodialOffer, submitCollateralProof } from "@/lib/api";

const DEMO_TXID = "0".repeat(63) + "1";

export default function BorrowPage() {
  const [borrower, setBorrower] = useState("human-demo-user");
  const [collateralSats, setCollateralSats] = useState(50000);
  const [network, setNetwork] = useState("bitcoin_testnet");
  const [offer, setOffer] = useState<any>(null);
  const [loanResult, setLoanResult] = useState<any>(null);
  const [fundingTxid, setFundingTxid] = useState(DEMO_TXID);
  const [vout, setVout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const estimate = useMemo(() => {
    const btcPrice = 60000;
    const principal = (collateralSats / 100_000_000) * btcPrice * 0.5;
    return { principal, fee: principal * 0.005 };
  }, [collateralSats]);

  async function requestOffer() {
    setLoading(true);
    setMessage(null);
    setLoanResult(null);
    const res = await createNoncustodialOffer({
      borrower_identifier: borrower,
      identifier_type: "human",
      collateral_sats: collateralSats,
      bitcoin_network: network,
    });
    setLoading(false);
    if (!res.success) {
      setMessage(res.error || "Offer request failed");
      return;
    }
    setOffer(res.data);
    setMessage("Offer created. Review the contract terms and submit lock proof when your wallet funds the contract output.");
  }

  async function submitProof() {
    if (!offer?.id) return;
    setLoading(true);
    setMessage(null);
    const res = await submitCollateralProof(offer.id, {
      funding_txid: fundingTxid,
      vout,
      amount_sats: collateralSats,
      proof_type: "txid_vout",
      verification_mode: network === "bitcoin_mainnet" ? "manual_review" : "dev_auto",
      notes: "Human UI non-custodial lock proof submission",
    });
    setLoading(false);
    if (!res.success) {
      setMessage(res.error || "Proof submission failed");
      return;
    }
    setLoanResult(res.data);
    setMessage(res.message || "Collateral proof submitted.");
  }

  return (
    <main className="min-h-screen bg-loop-dark text-white">
      <section className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="flex flex-col gap-3 border-b border-gray-800 pb-8">
          <div className="text-sm uppercase tracking-[0.3em] text-loop-muted">Loop XXI</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Non-custodial Bitcoin microloans</h1>
          <p className="max-w-3xl text-loop-muted text-lg">
            Lock BTC collateral from your own wallet, receive USDC from Loop treasury liquidity, repay on your schedule. Loop never has unilateral custody of your sats.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 bg-loop-panel rounded-2xl p-5 border border-gray-800 space-y-4">
            <h2 className="text-xl font-semibold">1. Request terms</h2>
            <label className="block space-y-1">
              <span className="text-sm text-loop-muted">Borrower label</span>
              <input value={borrower} onChange={(e) => setBorrower(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-loop-muted">Collateral sats</span>
              <input type="number" min={50000} max={2000000} value={collateralSats} onChange={(e) => setCollateralSats(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-loop-muted">Bitcoin network</span>
              <select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2">
                <option value="bitcoin_testnet">Bitcoin testnet</option>
                <option value="mutinynet">Mutinynet</option>
                <option value="bitcoin_regtest">Regtest</option>
                <option value="bitcoin_mainnet">Bitcoin mainnet</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Estimated USDC" value={`$${estimate.principal.toFixed(2)}`} />
              <Stat label="Fee" value={`$${estimate.fee.toFixed(2)}`} />
              <Stat label="LTV" value="50%" />
              <Stat label="APR" value="18%" />
            </div>
            <button onClick={requestOffer} disabled={loading || !borrower} className="w-full rounded bg-white text-black font-semibold py-2 disabled:opacity-40">
              {loading ? "Working..." : "Create non-custodial offer"}
            </button>
          </section>

          <section className="lg:col-span-2 bg-loop-panel rounded-2xl p-5 border border-gray-800 space-y-4">
            <h2 className="text-xl font-semibold">2. Review collateral contract</h2>
            {!offer && <p className="text-loop-muted">Request terms to generate a contract offer. No sats are sent to Loop.</p>}
            {offer && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Stat label="Offer ID" value={offer.id.slice(0, 8) + "..."} />
                  <Stat label="Status" value={offer.status} />
                  <Stat label="Contract" value={offer.contract_type} />
                </div>
                <div className="rounded-lg bg-loop-dark border border-gray-800 p-4 text-sm space-y-2">
                  <div className="text-loop-muted">Descriptor hash</div>
                  <div className="font-mono break-all">{offer.contract_terms?.descriptor_hash}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <Path label="Cooperative release" value={offer.contract_terms?.paths?.cooperative_repay_release} />
                  <Path label="Borrower refund" value={offer.contract_terms?.paths?.borrower_refund} />
                  <Path label="Maturity claim" value={offer.contract_terms?.paths?.maturity_claim} />
                  <Path label="Liquidation" value={offer.contract_terms?.paths?.liquidation} />
                </div>
                <div className="rounded-lg border border-yellow-900/60 bg-yellow-950/20 p-3 text-sm text-yellow-200">
                  {offer.contract_terms?.warning}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="bg-loop-panel rounded-2xl p-5 border border-gray-800 space-y-4">
          <h2 className="text-xl font-semibold">3. Submit collateral lock proof</h2>
          <p className="text-loop-muted text-sm max-w-3xl">
            Your wallet funds the non-custodial contract output. Submit the transaction ID and output index. Testnet/regtest/mutinynet offers can auto-open a test loan; mainnet proof requires production verifier review.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="md:col-span-2 space-y-1">
              <span className="text-sm text-loop-muted">Funding txid</span>
              <input value={fundingTxid} onChange={(e) => setFundingTxid(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2 font-mono" />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-loop-muted">vout</span>
              <input type="number" value={vout} onChange={(e) => setVout(Number(e.target.value))} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2" />
            </label>
            <div className="flex items-end">
              <button onClick={submitProof} disabled={!offer || loading} className="w-full rounded bg-loop-accent text-black font-semibold py-2 disabled:opacity-40">Submit proof</button>
            </div>
          </div>
          {message && <div className="rounded border border-gray-800 bg-loop-dark p-3 text-sm text-loop-muted">{message}</div>}
          {loanResult?.loan && (
            <div className="rounded-xl border border-green-900/60 bg-green-950/20 p-4 space-y-2">
              <h3 className="font-semibold text-green-300">Loan opened without Loop custody</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <Stat label="Loan ID" value={loanResult.loan.id.slice(0, 8) + "..."} />
                <Stat label="Status" value={loanResult.loan.status} />
                <Stat label="USDC status" value={loanResult.usdc?.status || "PENDING"} />
              </div>
              <a href="/app/user" className="inline-block text-sm underline text-white">Continue to user dashboard</a>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-loop-dark border border-gray-800 p-3"><div className="text-xs text-loop-muted">{label}</div><div className="font-mono text-lg break-all">{value}</div></div>;
}

function Path({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-lg bg-loop-dark border border-gray-800 p-3"><div className="text-xs text-loop-muted mb-1">{label}</div><div>{value || "-"}</div></div>;
}
