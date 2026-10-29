/**
 * Detects input that looks like a seed phrase or a private key. When it returns true the caller must
 * clear the field, must NOT send, store or log the text, and must show the seed-phrase warning.
 * (The backend has its own guard and answers 400 `secret_input`; this one stops it before it leaves the browser.)
 *
 * BUG-102 / BUG-105: every test runs on normalised text. Zero-width / bidi / soft-hyphen characters are removed and
 * full-width forms are folded (NFKC) first, and 64-hex, WIF and extended keys are also recognised when they were split by
 * spaces, hyphens, dots, colons or underscores ("e9873d79 c6d87dc0 ...", "5Hue AyNr-...").
 */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const SEED_LENGTHS = new Set([12, 15, 18, 21, 24]);

/** Zero-width, bidi-control, soft-hyphen and similar invisible code points (a code-point test, not a regex class). */
function isInvisible(cp: number): boolean {
  return (
    cp === 0xad || cp === 0x34f || cp === 0x61c || cp === 0x115f || cp === 0x1160 || cp === 0x17b4 || cp === 0x17b5 ||
    cp === 0x180e || cp === 0x3164 || cp === 0xfeff || cp === 0xffa0 ||
    (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}
/** Characters people put between the chunks of a key. */
export const KEY_SEPARATORS = /[\s\-_.:,;|/\\]+/;

/** Removes invisible characters and folds compatibility forms (full-width letters etc.). */
export function stripInvisible(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFKC")) if (!isInvisible(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

const HEX_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;
const WIF_RE = new RegExp(`^(?:5${BASE58}{50}|9${BASE58}{50}|[KLc]${BASE58}{51})$`);
const XPRV_RE = new RegExp(`^[xyztu]prv${BASE58}{100,112}$`);

/** Does this single string (no separators) look like a raw key? */
export function isKeyShaped(compact: string): boolean {
  return HEX_RE.test(compact) || WIF_RE.test(compact) || XPRV_RE.test(compact);
}

/**
 * True when a run of consecutive separator-delimited chunks, taken together, forms a hex / WIF / extended key.
 * Windows start and end on chunk boundaries so ordinary sentences do not match.
 */
export function hasSplitKey(text: string): boolean {
  const tokens = stripInvisible(text).split(KEY_SEPARATORS).filter(Boolean).slice(0, 400);
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let j = i; j < tokens.length && joined.length <= 120; j++) {
      joined += tokens[j];
      if (joined.length >= 51 && isKeyShaped(joined)) return true;
    }
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

  // raw private key (64 hex, 0x optional), WIF (mainnet 5/K/L, testnet c/9) or extended private key, also when split
  if (isKeyShaped(text) || hasSplitKey(text)) return true;

  return false;
}
