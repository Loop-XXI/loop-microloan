"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface Props {
  loans?: { ltv_at_origination?: number }[];
}

export default function LTVDistributionChart({ loans = [] }: Props) {
  const buckets = [
    { label: "<50%", min: 0, max: 0.5, count: 0 },
    { label: "50-60%", min: 0.5, max: 0.6, count: 0 },
    { label: "60-70%", min: 0.6, max: 0.7, count: 0 },
    { label: "70-80%", min: 0.7, max: 0.8, count: 0 },
    { label: "≥80%", min: 0.8, max: 10, count: 0 },
  ];

  loans.forEach((l) => {
    const ltv = l.ltv_at_origination ?? 0;
    for (const b of buckets) {
      if (ltv >= b.min && ltv < b.max) {
        b.count++;
        break;
      }
    }
  });

  return (
    <div className="bg-loop-panel rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">LTV Distribution</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151" }}
              labelStyle={{ color: "#9CA3AF" }}
            />
            <Bar dataKey="count" fill="#22C55E" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
