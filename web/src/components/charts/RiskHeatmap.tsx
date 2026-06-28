"use client";

interface Props {
  loans?: { ltv_at_origination?: number; status?: string }[];
}

export default function RiskHeatmap({ loans = [] }: Props) {
  const total = loans.length || 1;
  const safe = loans.filter((l) => (l.ltv_at_origination ?? 0) < 0.6).length;
  const caution = loans.filter((l) => {
    const v = l.ltv_at_origination ?? 0;
    return v >= 0.6 && v < 0.7;
  }).length;
  const warning = loans.filter((l) => {
    const v = l.ltv_at_origination ?? 0;
    return v >= 0.7 && v < 0.8;
  }).length;
  const danger = loans.filter((l) => (l.ltv_at_origination ?? 0) >= 0.8).length;

  const segments = [
    { label: "Safe (<60%)", value: safe, color: "bg-green-600" },
    { label: "Caution (60-70%)", value: caution, color: "bg-yellow-600" },
    { label: "Warning (70-80%)", value: warning, color: "bg-orange-600" },
    { label: "Danger (≥80%)", value: danger, color: "bg-red-600" },
  ];

  return (
    <div className="bg-loop-panel rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Risk Heatmap</h3>
      <div className="space-y-3">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div key={seg.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-loop-muted">{seg.label}</span>
                <span className="font-mono">{seg.value} ({pct.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${seg.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
