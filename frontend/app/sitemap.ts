import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/login", "/wallet-guard"].map((path) => ({ url: `${BASE}${path}` }));
}
