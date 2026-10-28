/**
 * Detects input that looks like a seed phrase or a private key. When it returns true the caller must
 * clear the field, must NOT send, store or log the text, and must show the seed-phrase warning.
 * (The backend has its own guard and answers 400 `secret_input`; this one stops it before it leaves the browser.)
 */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const SEED_LENGTHS = new Set([12, 15, 18, 21, 24]);

export function looksLikeSecret(input: string): boolean {
  const text = input.trim();
  if (text === "") return false;

  // 12/15/18/21/24 space-separated lowercase words (BIP-39 style)
  const words = text.split(/\s+/);
  if (SEED_LENGTHS.has(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w))) return true;

  // 64 hex characters (raw private key), with or without 0x
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(text)) return true;

  // WIF: 51 chars starting with 5, or 52 starting with K or L
  if (new RegExp(`^5${BASE58}{50}$`).test(text) || new RegExp(`^[KL]${BASE58}{51}$`).test(text)) return true;

  // Extended private keys
  if (new RegExp(`^[xyztu]prv${BASE58}{100,112}$`).test(text)) return true;

  return false;
}
