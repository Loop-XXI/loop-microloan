"use client";

import { useEffect, useState } from "react";
import { getDashboardLoans } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export default function ActiveLoansTable() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getDashboardLoans({ status: "ACTIVE", page: 1, page_size: 25, sort: "ltv_desc" }).then(setData);
    const t = setInterval(() => {
      getDashboardLoans({ status: "ACTIVE", page: 1, page_size: 25, sort: "ltv_desc" }).then(setData);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const loans = data?.data?.loans || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active Loans</h2>
        <span className="text-sm text-loop-muted">{loans.length} active</span>
      </div>
      <div className="bg-loop-panel rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-gray-700">
            <tr className="text-loop-muted">
              <th className="py-3 px-4">Loan ID</th>
              <th className="py-3 px-4">Borrower</th>
              <th className="py-3 px-4">Collateral (sats)</th>
              <th className="py-3 px-4">LTV</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">USDC</th>
              <th className="py-3 px-4">Opened</th>
              <th className="py-3 px-4">Expires</th>
              <th className="py-3 px-4">Interest (sats)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loans.map((loan: any) => (
              <tr key={loan.id} className="hover:bg-loop-dark transition">
                <td className="py-3 px-4 font-mono text-xs">{loan.id.slice(0, 8)}...</td>
                <td className="py-3 px-4 font-mono text-xs">{loan.borrower_id.slice(0, 8)}...</td>
                <td className="py-3 px-4 font-mono">{loan.collateral_sats?.toLocaleString()}</td>
                <td className="py-3 px-4">{(Number(loan.ltv_at_origination) * 100).toFixed(1)}%</td>
                <td className="py-3 px-4"><Badge variant={statusColor(loan.status)}>{loan.status}</Badge></td>
                <td className="py-3 px-4"><Badge variant={usdcColor(loan.usdc_status)}>{loan.usdc_status || "MISSING"}</Badge></td>
                <td className="py-3 px-4 text-loop-muted">{loan.loan_opened_at ? new Date(loan.loan_opened_at).toLocaleDateString() : "-"}</td>
                <td className="py-3 px-4 text-loop-muted">{loan.expires_at ? new Date(loan.expires_at).toLocaleDateString() : "-"}</td>
                <td className="py-3 px-4 font-mono">{loan.accrued_interest ?? 0}</td>
              </tr>
            ))}
            {loans.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-loop-muted">No active loans.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function usdcColor(status: string) {
  switch (status) {
    case "CONFIRMED": return "green" as const;
    case "SENT": return "blue" as const;
    case "READY": return "yellow" as const;
    case "PENDING": return "orange" as const;
    case "FAILED": return "red" as const;
    default: return "gray" as const;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "PENDING_COLLATERAL": return "yellow" as const;
    case "ACTIVE": return "green" as const;
    case "MARGIN_CALL": return "orange" as const;
    case "LIQUIDATED": return "red" as const;
    case "REPAID": return "blue" as const;
    case "DEFAULTED": return "red" as const;
    case "CANCELLED": return "gray" as const;
    default: return "gray" as const;
  }
}
