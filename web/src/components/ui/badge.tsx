import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "yellow" | "green" | "orange" | "red" | "blue" | "gray";
}

export function Badge({ children, variant = "gray" }: BadgeProps) {
  const map: Record<string, string> = {
    yellow: "bg-yellow-900/40 text-yellow-300",
    green: "bg-green-900/40 text-green-300",
    orange: "bg-orange-900/40 text-orange-300",
    red: "bg-red-900/40 text-red-300",
    blue: "bg-blue-900/40 text-blue-300",
    gray: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[variant]}`}>
      {children}
    </span>
  );
}
