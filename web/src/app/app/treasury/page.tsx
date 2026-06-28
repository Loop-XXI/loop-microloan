"use client";

import { useEffect, useState } from "react";
import { getTreasuryEvents } from "@/lib/api";

type TreasuryEvent = {
  id?: string;
  event_type?: string;
  amount_sats?: string | number;
  amount_usd?: string | number | null;
  btc_price_usd?: string | number | null;
  created_at?: string;
};

export default function TreasuryPage() {
  const [events, setEvents] = useState<TreasuryEvent[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTreasuryEvents(page, 25)
      .then((d) => {
        if (cancelled) return;
        const rows = Array.isArray(d?.data?.events) ? d.data.events : [];
        setEvents(rows);
        setError(d?.success === false ? d?.error || "Treasury API error" : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Treasury API error");
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Protocol Treasury</h1>
      {error && <div className="bg-red-900/30 text-red-200 rounded p-3 text-sm">{error}</div>}
      <div className="bg-loop-panel rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-gray-700 text-loop-muted">
            <tr>
              <th className="py-2 px-3">Event</th>
              <th className="py-2 px-3">Amount (sats)</th>
              <th className="py-2 px-3">USD</th>
              <th className="py-2 px-3">BTC Price</th>
              <th className="py-2 px-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {events.map((ev, idx) => (
              <tr key={ev.id || idx} className="hover:bg-loop-dark">
                <td className="py-3 px-3">{ev.event_type || "-"}</td>
                <td className="py-3 px-3 font-mono">{Number(ev.amount_sats || 0).toLocaleString()}</td>
                <td className="py-3 px-3">{ev.amount_usd != null ? `$${Number(ev.amount_usd).toFixed(4)}` : "-"}</td>
                <td className="py-3 px-3">{ev.btc_price_usd != null ? `$${Number(ev.btc_price_usd).toLocaleString()}` : "-"}</td>
                <td className="py-3 px-3 text-loop-muted">{ev.created_at ? new Date(ev.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-loop-muted">No events.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1 bg-loop-dark border border-gray-700 rounded disabled:opacity-30"
        >
          Previous
        </button>
        <span className="text-sm text-loop-muted">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 bg-loop-dark border border-gray-700 rounded"
        >
          Next
        </button>
      </div>
    </div>
  );
}
