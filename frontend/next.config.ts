import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16 blocks cross-origin requests to dev-only resources (HMR,
  // dev fonts) by default. The app is reachable via both "localhost" and
  // "127.0.0.1" in local dev/testing -- without this, loading via
  // 127.0.0.1 gets those requests silently blocked with just a console
  // warning, which can otherwise be mistaken for a real hydration bug.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false, // hides the dev-mode "N" badge that overlaps the phone pay app
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
