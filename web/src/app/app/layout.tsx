import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loop Dashboard",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-gray-800 p-6 hidden md:block">
        <h2 className="text-lg font-bold mb-6">Dashboard</h2>
        <nav className="space-y-3">
          <a href="/app" className="block text-loop-muted hover:text-white">Admin Overview</a>
          <a href="/app/user" className="block text-loop-muted hover:text-white">User Dashboard</a>
          <a href="/app/usdc" className="block text-loop-muted hover:text-white">USDC Rail</a>
          <a href="/app/offers" className="block text-loop-muted hover:text-white">Offer Queue</a>
          <a href="/app/loans" className="block text-loop-muted hover:text-white">Loans</a>
          <a href="/app/treasury" className="block text-loop-muted hover:text-white">Treasury</a>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
