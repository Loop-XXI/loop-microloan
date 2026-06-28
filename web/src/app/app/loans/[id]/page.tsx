"use client";

import { useEffect, useState } from "react";
import { getLoanStatus } from "@/lib/api";

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!params.id) return;
    getLoanStatus(params.id).then(setData);
    const t = setInterval(() => getLoanStatus(params.id).then(setData), 15000);
    return () => clearInterval(t);
  }, [params.id]);

  const loan = data?.data;
  if (!loan) return <div className="text-loop-muted">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Loan {loan.loan_id.slice(0, 8)}...</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClass(loan.status)}`}>{loan.status}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-loop-panel rounded-lg p-4">
        <div>
          <div className="text-loop-muted text-xs">Principal USD</div>
          <div className="text-lg font-mono">${loan.principal_usd}</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Collateral (sats)</div>
          <div className="text-lg font-mono">{loan.collateral_sats?.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Current LTV</div>
          <div className={`text-lg font-mono ${ltvClass(loan.current_ltv)}`}>{(loan.current_ltv * 100).toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">BTC Price</div>
          <div className="text-lg font-mono">${loan.current_btc_price}</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Accrued Interest</div>
          <div className="text-lg font-mono">{loan.accrued_interest_sats?.toLocaleString()} sats</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Total Repayment</div>
          <div className="text-lg font-mono">{loan.total_repayment_sats?.toLocaleString()} sats</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Hours Active</div>
          <div className="text-lg font-mono">{loan.hours_active?.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-loop-muted text-xs">Expires</div>
          <div className="text-lg">{new Date(loan.expires_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="bg-loop-panel rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">USDC Disbursement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-loop-muted text-xs">Status</div>
            <div className="text-lg font-mono">{loan.usdc_disbursement?.status || "MISSING"}</div>
          </div>
          <div>
            <div className="text-loop-muted text-xs">Amount</div>
            <div className="text-lg font-mono">${Number(loan.usdc_disbursement?.amount_usdc ?? 0).toFixed(4)} USDC</div>
          </div>
          <div>
            <div className="text-loop-muted text-xs">Network</div>
            <div className="text-lg font-mono">{loan.usdc_disbursement?.network || "UNSET"}</div>
          </div>
          <div>
            <div className="text-loop-muted text-xs">Transaction</div>
            <div className="text-lg font-mono break-all">{loan.usdc_disbursement?.transaction_id || "Not sent"}</div>
          </div>
        </div>
        {loan.usdc_disbursement?.notes && <p className="text-sm text-loop-muted">{loan.usdc_disbursement.notes}</p>}
      </div>
    </div>
  );
}

function statusClass(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-green-900/40 text-green-300";
    case "PENDING_COLLATERAL": return "bg-yellow-900/40 text-yellow-300";
    case "MARGIN_CALL": return "bg-orange-900/40 text-orange-300";
    case "LIQUIDATED": return "bg-red-900/40 text-red-300";
    case "REPAID": return "bg-blue-900/40 text-blue-300";
    default: return "bg-gray-800 text-gray-400";
  }
}

function ltvClass(ltv: number) {
  if (ltv >= 0.8) return "text-red-400";
  if (ltv >= 0.7) return "text-orange-400";
  if (ltv >= 0.6) return "text-yellow-400";
  return "text-green-400";
}
