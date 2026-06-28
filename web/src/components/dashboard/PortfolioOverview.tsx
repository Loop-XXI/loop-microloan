"use client";

export default function PortfolioOverview({ data }: { data?: any }) {
  if (!data) return <div className="text-loop-muted">Loading... </div>;

  const items = [
    { label: "Active Loans", value: data.active_loans ?? 0 },
    { label: "Total Collateral", value: `${data.total_collateral_sats?.toLocaleString() ?? 0} sats` },
    {
      label: "Total Loaned",
      value: `$${Number(data.total_principal_usd ?? 0).toFixed(2)}`,
    },
    { label: "Interest Earned", value: `${data.total_interest_earned_sats?.toLocaleString() ?? 0} sats` },
    { label: "USDC Pending", value: `$${Number(data.usdc_pending_amount ?? 0).toFixed(2)}`, warn: Number(data.usdc_pending_amount ?? 0) > 0 },
    { label: "Treasury Balance", value: `${data.treasury_balance_sats?.toLocaleString() ?? 0} sats` },
    {
      label: "BTC Price",
      value: `$${Number(data.current_btc_price ?? 0).toLocaleString()}`,
    },
    { label: "Loans at Risk", value: data.loans_at_risk ?? 0, warn: true },
    {
      label: "Margin Calls",
      value: data.loans_in_margin_call ?? 0,
      warn: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-loop-panel rounded-lg p-4">
          <div className="text-loop-muted text-xs mb-1">{item.label}</div>
          <div className={`text-xl font-semibold ${item.warn ? "text-loop-warning" : ""}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
