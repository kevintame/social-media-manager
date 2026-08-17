import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost", "booboo.taile36abe.ts.net"],
  experimental: { serverActions: { bodySizeLimit: "260mb" } },
};

export default nextConfig;
