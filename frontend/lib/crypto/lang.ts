import type { Lang } from "@/lib/crypto/api";

/**
 * The one mapping from the app's UI language to the language requested from the crypto service, which speaks
 * English and Hindi only. Marathi readers get the Devanagari (Hindi) text everywhere: Wallet Guard, the Copilot
 * cards and the councils must not disagree.
 */
export function toCryptoLang(appLang: string): Lang {
  return appLang === "hi" || appLang === "mr" ? "hi" : "en";
}
