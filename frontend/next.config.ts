import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy (REPORT-ONLY, deliberately). This policy with 'unsafe-inline' was never
// exercised against wallet connect, Plaid Link, the Dodo checkout redirect or Google sign-in, and
// breaking those is worse than not enforcing. Before switching the header key back to
// "Content-Security-Policy", run each of those flows in a production build with the browser console
// open, fix every reported violation, then enforce. Other security headers below stay enforced.
// Next injects inline bootstrap scripts, so without per-request nonces
// script-src needs 'unsafe-inline' (dev also needs 'unsafe-eval' for React refresh). Everything
// else is locked down: no plugins, no foreign framing, same-origin base/forms (plus https form
// targets for hosted checkout). img/connect/frame stay https-wide because merchant favicons,
// wallet/Plaid/Firebase SDKs and checkout redirects are third-party.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.plaid.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: wss:${isDev ? " ws:" : ""}`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Mic: Copilot / Wallet Guard voice input. Camera: /pay QR scanner and photo capture. Location stays off.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* config options here */
  // Next.js 16 blocks cross-origin requests to dev-only resources (HMR,
  // dev fonts) by default. The app is reachable via both "localhost" and
  // "127.0.0.1" in local dev/testing -- without this, loading via
  // 127.0.0.1 gets those requests silently blocked with just a console
  // warning, which can otherwise be mistaken for a real hydration bug.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false, // hides the dev-mode "N" badge that overlaps the phone pay app
  async rewrites() {
    // Dev default matches lib/apiBase.ts so /api/crypto/* works on a fresh checkout with no .env.local.
    const backendUrl =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:8000" : "");
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
