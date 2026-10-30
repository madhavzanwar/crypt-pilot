"use client";

import { translate, useT, type Lang } from "@/lib/i18n";
import { EXTRA } from "@/lib/i18nExtra";

// The component-level keys now live in lib/i18nExtra.ts and are part of the one dictionary in lib/i18n.ts;
// these exports remain so existing imports keep working.
export function tx(lang: Lang, key: string, fallback?: string): string {
  return translate(lang, key, fallback);
}

export { useT };

export const LOCAL_KEYS = Object.keys(EXTRA);
