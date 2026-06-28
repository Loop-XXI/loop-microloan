import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Microloan",
  description: "Bitcoin microloan protocol for autonomous agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-loop-dark text-white min-h-screen">{children}</body>
    </html>
  );
}
