import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/login"].map((path) => ({ url: `${base}${path}` }));
}
