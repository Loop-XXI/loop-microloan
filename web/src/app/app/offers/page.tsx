import { Badge } from "@/components/ui/badge";

async function loadOffers() {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8094/api/v1";
  const res = await fetch(`${api}/noncustodial/offers`, { cache: "no-store" });
  return res.json();
}

export default async function OffersPage() {
  const data = await loadOffers();
  const offers = data?.data?.offers || [];
  return (
    <div className="space-y-6">
      <div>
        <div className="text-loop-muted text-sm">Admin</div>
        <h1 className="text-2xl font-bold">Non-custodial Offer Queue</h1>
      </div>
      <div className="bg-loop-panel rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-gray-700 text-loop-muted">
            <tr>
              <th className="p-3">Offer</th>
              <th className="p-3">Borrower</th>
              <th className="p-3">Collateral</th>
              <th className="p-3">Principal</th>
              <th className="p-3">Network</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lock proof</th>
              <th className="p-3">Loan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {offers.map((o: any) => (
              <tr key={o.id}>
                <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}...</td>
                <td className="p-3 font-mono text-xs">{o.borrower_identifier}</td>
                <td className="p-3 font-mono">{Number(o.collateral_sats).toLocaleString()} sats</td>
                <td className="p-3 font-mono">${Number(o.principal_usd).toFixed(4)}</td>
                <td className="p-3 font-mono">{o.bitcoin_network}</td>
                <td className="p-3"><Badge variant={statusColor(o.status)}>{o.status}</Badge></td>
                <td className="p-3 font-mono text-xs break-all max-w-xs">{o.lock_txid || "-"}</td>
                <td className="p-3 font-mono text-xs">{o.loan_id ? `${o.loan_id.slice(0, 8)}...` : "-"}</td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-loop-muted">No offers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "LOAN_OPENED" || status === "LOCK_VERIFIED") return "green" as const;
  if (status === "OFFERED") return "yellow" as const;
  if (status === "LOCK_PROOF_SUBMITTED") return "orange" as const;
  if (["REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return "red" as const;
  return "gray" as const;
}
