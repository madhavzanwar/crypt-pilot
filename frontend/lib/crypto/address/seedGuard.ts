import { BIP39_WORDS } from "@/lib/crypto/voice/bip39Words";

/**
 * Detects input that looks like a seed phrase or a private key. When it returns true the caller must
 * clear the field, must NOT send, store or log the text, and must show the seed-phrase warning.
 * (The backend has its own guard and answers 400 `secret_input`; this one stops it before it leaves the browser.)
 *
 * Everything is tested after normalising: zero-width / soft-hyphen characters are dropped, and keys are also tested
 * with spaces and hyphens removed, so a key pasted as "e9873d79 c6d87dc0 ..." or "5Hue-AzRn..." is still caught.
 */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const SEED_LENGTHS = new Set([12, 15, 18, 21, 24]);
const INVISIBLE = /[​-‏⁠﻿­]/g;
/** Separators people (or dictation) put inside a key. */
const SEPARATORS = /[\s\-_.,:;]+/g;

const HEX64_FULL = /^(0x)?[0-9a-fA-F]{64}$/;
const WIF_FULL = [
  new RegExp(`^5${BASE58}{50}$`), // mainnet uncompressed
  new RegExp(`^[KL]${BASE58}{51}$`), // mainnet compressed
  new RegExp(`^c${BASE58}{51}$`), // testnet compressed
  new RegExp(`^9${BASE58}{50}$`), // testnet uncompressed
];
const XPRV_FULL = new RegExp(`^[xyztuv]prv${BASE58}{100,112}$`);

/** Drops invisible characters and applies NFKC (full-width letters become ASCII). */
export function stripInvisible(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "");
}

/** Text with invisible characters, spaces, hyphens and common separators removed. */
export function squashKey(text: string): string {
  return stripInvisible(text).replace(SEPARATORS, "");
}

/** True when `squashed` (no separators) is exactly a raw key, WIF or extended private key. */
export function isKeyShaped(squashed: string): boolean {
  return HEX64_FULL.test(squashed) || WIF_FULL.some((r) => r.test(squashed)) || XPRV_FULL.test(squashed);
}

/** 12+ consecutive BIP-39 words (a seed phrase with extra words, in any spacing). */
function hasBip39Run(words: string[]): boolean {
  let run = 0;
  for (const w of words) {
    run = BIP39_WORDS.has(w) ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

export function looksLikeSecret(input: string): boolean {
  const text = stripInvisible(input).trim();
  if (text === "") return false;

  // 12/15/18/21/24 space-separated lowercase words (BIP-39 style)
  // (case-insensitive; commas, semicolons and "1." / "1)" numbering between the words do not hide it)
  const words = text.toLowerCase().replace(/(^|[\s,;])\d{1,2}[.):]?(?=[\s,;])/g, " ").split(/[\s,;]+/).filter(Boolean);
  if (SEED_LENGTHS.has(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w))) return true;
  if (hasBip39Run(words)) return true;

  // raw hex key, WIF (mainnet or testnet) or extended private key, also when split by spaces / hyphens
  return isKeyShaped(text) || isKeyShaped(squashKey(text));
}
