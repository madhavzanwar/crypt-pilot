/**
 * Tokens that must never be rewritten or sent for translation: hashes, wallet addresses, UUIDs, ids, PAN.
 * Converting their digits to Devanagari makes a SHA-256 impossible to compare with `sha256sum` and corrupts addresses.
 * Pure module (no imports) so it can be tested with plain node.
 */

/** A "word" for guarding purposes: letters/digits, optionally joined by - _ or a "…"/"..." truncation mark. */
const TOKEN = /[A-Za-z0-9]+(?:(?:[-_]|…|\.\.\.)[A-Za-z0-9]+)*/g;

/** Devanagari digits plus ascii digits: the guard works on either form. */
const DIGIT = /[0-9०-९]/;
const LETTER = /[A-Za-z]/;

export function isProtectedToken(tok: string): boolean {
  if (/^(SHA|MD|RSA|AES)-?\d{1,4}$/i.test(tok)) return true; // algorithm names: SHA-256
  if (/^0x[0-9a-fA-F]*$/i.test(tok) && tok.length >= 3) return true; // 0x-prefixed hex, any length (also truncated)
  if (/^(bc1|tb1)[0-9a-z]/i.test(tok)) return true; // bech32 addresses
  if (/(…|\.\.\.)/.test(tok) && DIGIT.test(tok) && LETTER.test(tok)) return true; // truncated address / hash
  if (tok.length >= 8 && DIGIT.test(tok) && LETTER.test(tok)) return true; // ids, UUIDs, PAN, long hex, base58
  if (/^[0-9a-fA-F]{16,}$/.test(tok)) return true; // long hex, even when it happens to have no letters
  return false;
}

/** The text with protected tokens replaced by a neutral placeholder, to decide whether anything is left to translate. */
export function stripProtected(text: string): string {
  return text.replace(TOKEN, (t) => (isProtectedToken(t) ? " " : t));
}

/** Ascii digits to Devanagari numerals (Hindi and Marathi share them), leaving protected tokens untouched. */
export function toDevanagariDigits(text: string): string {
  return text.replace(TOKEN, (t) =>
    isProtectedToken(t) ? t : t.replace(/[0-9]/g, (d) => String.fromCharCode(0x966 + +d)),
  );
}

/** Devanagari numerals back to ascii (always safe: it never touches a protected token's letters). */
export function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));
}
