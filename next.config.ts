import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expense receipts (up to 10 MB) are uploaded through a server action.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;
