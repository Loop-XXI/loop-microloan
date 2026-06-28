"use client";

import { useEffect, useState } from "react";
import { getDashboardLoans } from "@/lib/api";

export default function LoansPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getDashboardLoans({ status: statusFilter || undefined, page, page_size: 25, sort: "ltv_desc" }).then(setData);
  }, [statusFilter, page]);

  const loans = data?.data?.loans || [];
  const total = data?.data?.total || 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Loans</h1>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-loop-dark border border-gray-700 rounded-lg px-3 py-1"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_COLLATERAL">Pending</option>
          <option value="MARGIN_CALL">Margin Call</option>
          <option value="LIQUIDATED">Liquidated</option>
          <option value="REPAID">Repaid</option>
        </select>
      </div>

      <table className="w-full text-sm text-left">
        <thead className="border-b border-gray-700">
          <tr className="text-loop-muted">
            <th className="py-2">ID</th>
            <th className="py-2">Status</th>
            <th className="py-2">Collateral (sats)</th>
            <th className="py-2">Principal USD</th>
            <th className="py-2">LTV</th>
            <th className="py-2">Opened</th>
            <th className="py-2">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {loans.map((loan: any) => (
            <tr key={loan.id} className="hover:bg-loop-dark transition">
              <td className="py-3 font-mono text-xs">{loan.id.slice(0, 8)}...</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(loan.status)}`}>
                  {loan.status}
                </span>
              </td>
              <td className="py-3 font-mono">{loan.collateral_sats.toLocaleString()}</td>
              <td className="py-3">${Number(loan.principal_usd).toFixed(2)}</td>
              <td className="py-3">{(Number(loan.ltv_at_origination) * 100).toFixed(1)}%</td>
              <td className="py-3 text-loop-muted">{loan.loan_opened_at ? new Date(loan.loan_opened_at).toLocaleDateString() : "-"}</td>
              <td className="py-3 text-loop-muted">{loan.expires_at ? new Date(loan.expires_at).toLocaleDateString() : "-"}</td>
            </tr>
          ))}
          {loans.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-loop-muted">No loans found.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between pt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="px-3 py-1 bg-loop-dark border border-gray-700 rounded disabled:opacity-30"
        >
          Previous
        </button>
        <span className="text-sm text-loop-muted">Page {page} of {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="px-3 py-1 bg-loop-dark border border-gray-700 rounded disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case "PENDING_COLLATERAL": return "bg-yellow-900/40 text-yellow-300";
    case "ACTIVE": return "bg-green-900/40 text-green-300";
    case "MARGIN_CALL": return "bg-orange-900/40 text-orange-300";
    case "LIQUIDATED": return "bg-red-900/40 text-red-300";
    case "REPAID": return "bg-blue-900/40 text-blue-300";
    case "DEFAULTED": return "bg-red-950 text-red-400";
    case "CANCELLED": return "bg-gray-800 text-gray-400";
    default: return "bg-gray-800 text-gray-400";
  }
}
