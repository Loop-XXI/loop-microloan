"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useEffect, useState } from "react";

interface Props {
  thresholds: { margin: number; liquidation: number };
}

export default function BTCPriceChart({ thresholds }: Props) {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // TODO: wire to real price log API
    const mock = Array.from({ length: 24 }, (_, i) => ({
      time: `${i}:00`,
      price: 56000 + Math.random() * 2000 - 1000,
    }));
    setData(mock);
  }, []);

  return (
    <div className="bg-loop-panel rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">BTC Price (24h)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "#9CA3AF", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151" }}
              labelStyle={{ color: "#9CA3AF" }}
            />
            <ReferenceLine
              y={55000 * (1 + thresholds.margin / 100)}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              label={{ value: "Margin", fill: "#F59E0B", fontSize: 12, position: "right" }}
            />
            <ReferenceLine
              y={55000 * (1 + thresholds.liquidation / 100)}
              stroke="#EF4444"
              strokeDasharray="4 4"
              label={{ value: "Liquidation", fill: "#EF4444", fontSize: 12, position: "right" }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
