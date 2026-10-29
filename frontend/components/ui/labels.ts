import { CATEGORY_META } from "@/lib/spend";
import type { TxnCategory } from "@/lib/types";

/** "rent_housing" -> "Rent & housing". Falls back to a sentence-cased, de-underscored string for unknown values. */
export function categoryLabel(category: string): string {
  const known = CATEGORY_META[category as TxnCategory];
  if (known) return known.label;
  const spaced = category.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
