"use client";

import { useEffect, useState } from "react";
import { getUserLoans, updateUSDCRecipient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export default function UserDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [network, setNetwork] = useState("base");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const borrower = "real-funded-test-agent-minimum-001";

  useEffect(() => {
    getUserLoans(borrower).then(setData);
    const t = setInterval(() => getUserLoans(borrower).then(setData), 15000);
    return () => clearInterval(t);
  }, []);

  const loans = data?.data?.loans || [];
  const activeLoan = loans[0];

  async function saveRecipient() {
    if (!activeLoan) return;
    setMessage("Saving USDC recipient...");
    const res = await updateUSDCRecipient(activeLoan.id, { network, recipient_address: recipient });
    if (!res.success) {
      setMessage(res.error || "Failed to save recipient");
      return;
    }
    setMessage("USDC recipient saved. Disbursement is ready for admin approval.");
    getUserLoans(borrower).then(setData);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="text-loop-muted text-sm">User Dashboard</div>
        <h1 className="text-2xl font-bold">{borrower}</h1>
      </div>

      {!activeLoan && <div className="bg-loop-panel rounded-lg p-6 text-loop-muted">No loans found for this borrower.</div>}

      {activeLoan && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card label="Loan Status" value={activeLoan.status} badge={loanBadge(activeLoan.status)} />
            <Card label="Collateral" value={`${Number(activeLoan.collateral_sats).toLocaleString()} sats`} />
            <Card label="USDC Credit" value={`$${Number(activeLoan.usdc_amount ?? activeLoan.principal_usd).toFixed(4)}`} />
            <Card label="USDC Status" value={activeLoan.usdc_status || "MISSING"} badge={usdcBadge(activeLoan.usdc_status)} />
          </div>

          <div className="bg-loop-panel rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Active Loan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Field label="Loan ID" value={activeLoan.id} />
              <Field label="Borrower ID" value={activeLoan.borrower_id} />
              <Field label="Current LTV" value={`${(Number(activeLoan.current_ltv || 0) * 100).toFixed(2)}%`} />
              <Field label="BTC Price" value={`$${Number(activeLoan.current_btc_price_num || 0).toLocaleString()}`} />
              <Field label="Accrued Interest" value={`${Number(activeLoan.accrued_interest_sats || 0).toLocaleString()} sats`} />
              <Field label="Total Repayment" value={`${Number(activeLoan.total_repayment_sats || 0).toLocaleString()} sats`} />
              <Field label="Opened" value={activeLoan.loan_opened_at ? new Date(activeLoan.loan_opened_at).toLocaleString() : "-"} />
              <Field label="Expires" value={activeLoan.expires_at ? new Date(activeLoan.expires_at).toLocaleString() : "-"} />
            </div>
          </div>

          <div className="bg-loop-panel rounded-lg p-4 space-y-4">
            <h2 className="text-lg font-semibold">USDC Disbursement</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Field label="Status" value={activeLoan.usdc_status || "MISSING"} />
              <Field label="Amount" value={`$${Number(activeLoan.usdc_amount || 0).toFixed(4)} USDC`} />
              <Field label="Network" value={activeLoan.usdc_network || "UNSET"} />
              <Field label="Recipient" value={activeLoan.usdc_recipient_address || "Not set"} />
              <Field label="Transaction" value={activeLoan.usdc_transaction_id || "Not sent"} />
              <Field label="Notes" value={activeLoan.usdc_notes || "-"} />
            </div>

            {!["SENT", "CONFIRMED"].includes(activeLoan.usdc_status) && (
              <div className="border-t border-gray-800 pt-4 space-y-3">
                <h3 className="font-semibold">Set USDC destination</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <div className="text-loop-muted text-xs">Network</div>
                    <select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2">
                      <option value="base">Base</option>
                      <option value="ethereum">Ethereum</option>
                      <option value="polygon">Polygon</option>
                      <option value="arbitrum">Arbitrum</option>
                    </select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <div className="text-loop-muted text-xs">Recipient address</div>
                    <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="w-full bg-loop-dark border border-gray-700 rounded px-3 py-2 font-mono" />
                  </label>
                </div>
                <button onClick={saveRecipient} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium">Save USDC Destination</button>
                {message && <div className="text-sm text-loop-muted">{message}</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, badge }: { label: string; value: string; badge?: any }) {
  return (
    <div className="bg-loop-panel rounded-lg p-4">
      <div className="text-loop-muted text-xs mb-1">{label}</div>
      {badge ? <Badge variant={badge}>{value}</Badge> : <div className="text-xl font-semibold font-mono">{value}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-loop-muted text-xs">{label}</div>
      <div className="font-mono break-all">{value}</div>
    </div>
  );
}

function loanBadge(status: string) {
  if (status === "ACTIVE") return "green";
  if (status === "PENDING_COLLATERAL") return "yellow";
  if (status === "MARGIN_CALL") return "orange";
  if (status === "LIQUIDATED" || status === "DEFAULTED") return "red";
  return "gray";
}

function usdcBadge(status: string) {
  if (status === "CONFIRMED") return "green";
  if (status === "SENT") return "blue";
  if (status === "READY") return "yellow";
  if (status === "PENDING") return "orange";
  if (status === "FAILED") return "red";
  return "gray";
}
