import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  allowedDevOrigins: ['iptv.foundry.test'],
  devIndicators: false,
  images: {
    // Broad allowlist while img-proxy is being wired into components.
    // TODO(Track B follow-up): restrict to actual provider CDN hostnames once
    // channel logo sources are confirmed — the wildcard is here to unblock
    // next/image usage before we know all provider domains.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
