/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.loop.finance/api/v1";
    // Strip trailing /api/v1 if present to avoid double-pathing
    const baseUrl = apiBase.replace(/\/api\/v1$/, "");
    return [
      {
        source: "/api/v1/:path*",
        destination: `${baseUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
