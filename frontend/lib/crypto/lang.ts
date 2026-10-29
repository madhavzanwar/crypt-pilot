import type { Lang } from "@/lib/crypto/api";

/**
 * The one mapping from the UI language to the language requested from the crypto service (BUG-006).
 * The service explains in English or Hindi only; Marathi and Hindi UIs both get Hindi, everything else English.
 * Wallet Guard, the Copilot card and the council must all go through this so Marathi behaves identically.
 */
export function toRequestLang(uiLang: string): Lang {
  return uiLang === "hi" || uiLang === "mr" ? "hi" : "en";
}
