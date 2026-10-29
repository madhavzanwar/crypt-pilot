/** Returns the href only if it is a relative path or an http(s)/mailto URL; otherwise "#" (blocks javascript:, data:, etc.). */
export function safeHref(href: string | null | undefined): string {
  if (!href) return "#";
  const h = href.trim();
  if (h.startsWith("//")) return "#";
  if (h.startsWith("/") || h.startsWith("#") || h.startsWith("?")) return h;
  try {
    const u = new URL(h);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? h : "#";
  } catch {
    return "#"; // schemeless relative-looking strings ("foo") are not trusted either
  }
}

export function isInternalHref(href: string | null | undefined): boolean {
  return !!href && href.trim().startsWith("/") && !href.trim().startsWith("//");
}
