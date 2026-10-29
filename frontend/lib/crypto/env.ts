/** Public (browser-visible) configuration for the crypto features. Values are never committed. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
export const EAS_SCHEMA_UID = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ?? "";
/** EAS contract on Base Sepolia (OP-stack predeploy). */
export const EAS_CONTRACT = process.env.NEXT_PUBLIC_EAS_CONTRACT ?? "0x4200000000000000000000000000000000000021";
/** `??` keeps an empty string, which Number() turns into chain 0: treat blank / non-numeric values as unset (BUG-076). */
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
export const CHAIN_ID = positiveInt(process.env.NEXT_PUBLIC_CHAIN_ID, 84532);
export const EASSCAN_URL = "https://base-sepolia.easscan.org";
/** "browser" forces the Web Speech API instead of POST /api/crypto/transcribe. */
export const VOICE_MODE: "auto" | "browser" = process.env.NEXT_PUBLIC_VOICE_MODE === "browser" ? "browser" : "auto";
