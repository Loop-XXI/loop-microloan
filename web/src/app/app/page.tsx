"use client";

import { useEffect, useState } from "react";
import { getDashboardSummary } from "@/lib/api";
import PortfolioOverview from "@/components/dashboard/PortfolioOverview";
import ActiveLoansTable from "@/components/dashboard/ActiveLoansTable";
import RiskHeatmap from "@/components/charts/RiskHeatmap";
import BTCPriceChart from "@/components/charts/BTCPriceChart";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getDashboardSummary().then(setData);
    const t = setInterval(() => getDashboardSummary().then(setData), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-8">
      <PortfolioOverview data={data?.data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BTCPriceChart thresholds={{ margin: 70, liquidation: 80 }} />
        <RiskHeatmap loans={data?.data?.loans || []} />
      </div>
      <ActiveLoansTable />
    </div>
  );
}
