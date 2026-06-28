import { Badge } from "@/components/ui/badge";

async function loadUSDC() {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8092/api/v1";
  const res = await fetch(`${api}/usdc/disbursements`, { cache: "no-store" });
  return res.json();
}

export default async function AdminUSDCPage() {
  const data = await loadUSDC();
  const disbursements = data?.data?.disbursements || [];
  const attempts = data?.data?.attempts || [];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-loop-muted text-sm">Admin</div>
        <h1 className="text-2xl font-bold">USDC Disbursement Rail</h1>
      </div>

      <div className="bg-loop-panel rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-gray-700 text-loop-muted">
            <tr>
              <th className="p-3">Loan</th>
              <th className="p-3">Borrower</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Network</th>
              <th className="p-3">Recipient</th>
              <th className="p-3">Status</th>
              <th className="p-3">Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {disbursements.map((d: any) => (
              <tr key={d.id}>
                <td className="p-3 font-mono text-xs">{d.loan_id.slice(0, 8)}...</td>
                <td className="p-3 font-mono text-xs">{d.borrower_identifier}</td>
                <td className="p-3 font-mono">${Number(d.amount_usdc).toFixed(4)}</td>
                <td className="p-3 font-mono">{d.network}</td>
                <td className="p-3 font-mono break-all max-w-xs">{d.recipient_address || "Not set"}</td>
                <td className="p-3"><Badge variant={statusColor(d.status)}>{d.status}</Badge></td>
                <td className="p-3 font-mono break-all max-w-sm">{d.transaction_id || d.error_message || "-"}</td>
              </tr>
            ))}
            {disbursements.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-loop-muted">No USDC disbursements.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-loop-panel rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Attempt Log</h2>
        <div className="space-y-2 text-sm">
          {attempts.map((a: any) => (
            <div key={a.id} className="border border-gray-800 rounded p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
              <div><span className="text-loop-muted">Status</span><br /><Badge variant={statusColor(a.status)}>{a.status}</Badge></div>
              <div><span className="text-loop-muted">Amount</span><br />${Number(a.amount_usdc).toFixed(4)}</div>
              <div><span className="text-loop-muted">Network</span><br />{a.network}</div>
              <div className="font-mono break-all"><span className="text-loop-muted">Tx/Error</span><br />{a.transaction_id || a.error_message || "-"}</div>
              <div><span className="text-loop-muted">Time</span><br />{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
          {attempts.length === 0 && <div className="text-loop-muted">No attempts yet.</div>}
        </div>
      </div>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "CONFIRMED") return "green" as const;
  if (status === "SENT") return "blue" as const;
  if (status === "READY") return "yellow" as const;
  if (status === "PENDING" || status === "REQUESTED") return "orange" as const;
  if (status === "FAILED") return "red" as const;
  return "gray" as const;
}
