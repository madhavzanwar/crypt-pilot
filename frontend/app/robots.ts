import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

// Only the public pages are crawlable; the app routes sit behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/login"], disallow: ["/api/", "/pay"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
