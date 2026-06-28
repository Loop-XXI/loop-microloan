"use client";

import { useState } from "react";
import { openLoan } from "@/lib/api";

export default function LandingPage() {
  const [identifier, setIdentifier] = useState("");
  const [sats, setSats] = useState(100000);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleOpenLoan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await openLoan({
        borrower_identifier: identifier,
        collateral_sats: sats,
        identifier_type: "agent_id",
      });
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  const btcPrice = 57000;
  const estLoan = (sats * 0.5) / 1e8 * btcPrice;
  const protocolFee = estLoan * 0.005;

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-4">Loop Microloan</h1>
      <p className="text-loop-muted mb-10">
        Deposit sats via Lightning. Receive USDC. Repay on your schedule.
        Automatic liquidation at 80% LTV.
      </p>

      <section className="bg-loop-panel rounded-xl p-6 mb-10">
        <h2 className="text-xl font-semibold mb-4">Loan Calculator</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col">
            <span className="text-sm text-loop-muted mb-1">Collateral (sats)</span>
            <input
              type="number"
              min={50000}
              max={2000000}
              value={sats}
              onChange={(e) => setSats(Number(e.target.value))}
              className="bg-loop-dark border border-gray-700 rounded-lg px-4 py-2"
            />
          </label>
          <div className="flex flex-col">
            <span className="text-sm text-loop-muted mb-1">Estimated USDC</span>
            <div className="text-2xl font-mono">${estLoan.toFixed(2)}</div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-loop-muted mb-1">Protocol Fee (0.5%)</span>
            <div className="text-lg font-mono text-loop-warning">${protocolFee.toFixed(2)}</div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-loop-muted mb-1">APR</span>
            <div className="text-lg font-mono">18%</div>
          </div>
        </div>
      </section>

      <section className="bg-loop-panel rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Open Loan</h2>
        <form onSubmit={handleOpenLoan} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Agent ID or Lightning Pubkey"
            className="bg-loop-dark border border-gray-700 rounded-lg px-4 py-2"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading || !identifier}
            className="bg-loop-accent text-black font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {loading ? "Opening..." : "Get a Loan"}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-900/20 rounded-lg border border-red-800">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {result && result.data && (
          <div className="mt-6 p-4 bg-loop-dark rounded-lg border border-gray-700">
            <p className="text-loop-accent font-semibold">{result.data.message}</p>
            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
              <div>
                <span className="text-loop-muted">Loan ID: </span>
                <span className="font-mono">{result.data.loan_id}</span>
              </div>
              <div>
                <span className="text-loop-muted">Status: </span>
                <span>{result.data.status}</span>
              </div>
              <div>
                <span className="text-loop-muted">Loan USD: </span>
                <span className="font-mono">${result.data.estimated_loan_usd}</span>
              </div>
              <div>
                <span className="text-loop-muted">Fee: </span>
                <span className="font-mono">${result.data.protocol_fee_usd}</span>
              </div>
            </div>
            <p className="text-sm text-loop-muted mt-3">Collateral Invoice:</p>
            <code className="break-all text-xs block mt-1 bg-loop-panel p-2 rounded">{result.data.collateral_invoice}</code>
          </div>
        )}
      </section>

      <div className="mt-10 text-center">
        <a href="/app" className="text-loop-muted hover:text-white text-sm">Admin Dashboard</a>
      </div>
    </main>
  );
}
