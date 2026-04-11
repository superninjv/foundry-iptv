import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  allowedDevOrigins: ['iptv.foundry.test'],
  devIndicators: false,
};

export default nextConfig;
