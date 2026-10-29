/** Public (browser-visible) configuration for the crypto features. Values are never committed. */
export const WALLETCONNECT_PROJECT_ID = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();
export const EAS_SCHEMA_UID = (process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ?? "").trim();
/** EAS contract on Base Sepolia (OP-stack predeploy). */
export const EAS_CONTRACT = process.env.NEXT_PUBLIC_EAS_CONTRACT?.trim() || "0x4200000000000000000000000000000000000021";
/** A blank or non-numeric value falls back to Base Sepolia (84532) instead of becoming chain 0. */
export function parseChainId(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : 84532;
}
export const CHAIN_ID = parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID);
export const EASSCAN_URL = "https://base-sepolia.easscan.org";
/** "browser" forces the Web Speech API instead of POST /api/crypto/transcribe. */
export const VOICE_MODE: "auto" | "browser" = process.env.NEXT_PUBLIC_VOICE_MODE === "browser" ? "browser" : "auto";
