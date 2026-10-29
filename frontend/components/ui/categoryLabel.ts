import { CATEGORY_META } from "@/lib/spend";

/** Human label for a raw category id ("rent_housing" -> "Rent & housing"); unknown ids are title-cased (BUG-092). */
export function categoryLabel(c: string): string {
  const meta = (CATEGORY_META as Record<string, { label: string }>)[c];
  if (meta) return meta.label;
  const s = c.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
