import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        loop: {
          dark: "#0B0F19",
          panel: "#111827",
          accent: "#22C55E",
          danger: "#EF4444",
          warning: "#F59E0B",
          info: "#3B82F6",
          muted: "#6B7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
