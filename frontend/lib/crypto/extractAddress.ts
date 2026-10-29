import { isValidBase58Check, isValidSegwit } from "@/lib/crypto/address/checksum";
import { validateAddress } from "@/lib/crypto/address/validate";
import { isKeyShaped, looksLikeSecret } from "@/lib/crypto/address/seedGuard";
import { BIP39_WORDS } from "@/lib/crypto/voice/bip39Words";

/**
 * Pulls a Bitcoin MAINNET address out of a chat message (typed or dictated) and tells a seed phrase apart
 * from ordinary text. Everything here runs in the browser and is synchronous.
 *
 * Format checks come from lib/crypto/address/validate.ts. On top of that this file verifies the checksum
 * (base58check for 1... and 3..., bech32 for bc1q..., bech32m for bc1p...), so a stray word never turns
 * into a wallet check and a typo is reported as a typo instead of being sent.
 */

export { isValidBase58Check, isValidSegwit };

export type AddressScan = {
  /** The address as it should be sent to the check (bech32 is lower-cased). */
  address: string;
  /** False when it has the right shape but the checksum fails (almost always a typo or mishearing). */
  checksumValid: boolean;
};

function checksumOk(address: string): boolean {
  return /^bc1/i.test(address) ? isValidSegwit(address) : isValidBase58Check(address);
}

const MAX_SQUASH = 1500;

/** Dictated addresses come out with spaces between pieces: look for one in the text with spaces removed. */
function scanSquashed(text: string): string | null {
  const joined = text.replace(/[^A-Za-z0-9]+/g, "").slice(0, MAX_SQUASH);
  const lower = joined.toLowerCase();
  for (let s = lower.indexOf("bc1"); s !== -1; s = lower.indexOf("bc1", s + 1)) {
    for (let len = Math.min(90, joined.length - s); len >= 14; len--) {
      const cand = joined.slice(s, s + len);
      if (isValidSegwit(cand)) return cand.toLowerCase();
    }
  }
  for (let s = 0; s < joined.length; s++) {
    if (joined[s] !== "1" && joined[s] !== "3") continue;
    for (let len = Math.min(35, joined.length - s); len >= 26; len--) {
      const cand = joined.slice(s, s + len);
      if (isValidBase58Check(cand)) return cand;
    }
  }
  return null;
}

/**
 * First Bitcoin mainnet address in `text`, or null. A candidate with a bad checksum is returned with
 * `checksumValid: false` only when no valid one exists, so the caller can say "check for a typo".
 * `allowDemo` also accepts the sandbox's DEMO-... placeholders (they have no checksum).
 */
export function scanAddress(text: string, opts: { allowDemo?: boolean } = {}): AddressScan | null {
  let malformed: AddressScan | null = null;
  for (const raw of text.split(/[^A-Za-z0-9-]+/)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (token === "") continue;
    const v = validateAddress(token, opts);
    if (!v.ok) continue;
    if (v.kind === "demo") return { address: v.address, checksumValid: true };
    if (checksumOk(v.address)) return { address: v.address, checksumValid: true };
    malformed ??= { address: v.address, checksumValid: false };
  }
  const squashed = scanSquashed(text);
  if (squashed) return { address: squashed, checksumValid: true };
  return malformed;
}

/**
 * Every distinct address in `text` (valid checksums first), at most `max` of them, plus how many more were ignored.
 * A message such as "compare A and B" gives two cards instead of silently dropping B.
 */
export function scanAddresses(text: string, opts: { allowDemo?: boolean } = {}, max = 3): { scans: AddressScan[]; ignored: number } {
  const valid: AddressScan[] = [];
  const bad: AddressScan[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[^A-Za-z0-9-]+/)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (token === "") continue;
    const v = validateAddress(token, opts);
    if (!v.ok || seen.has(v.address)) continue;
    seen.add(v.address);
    if (v.kind === "demo" || checksumOk(v.address)) valid.push({ address: v.address, checksumValid: true });
    else bad.push({ address: v.address, checksumValid: false });
  }
  if (valid.length === 0) {
    const squashed = scanSquashed(text);
    if (squashed) valid.push({ address: squashed, checksumValid: true });
  }
  const all = valid.length > 0 ? valid : bad.slice(0, 1);
  return { scans: all.slice(0, max), ignored: Math.max(0, all.length - max) };
}

/** The first address with a valid checksum, or null. */
export function extractAddress(text: string, opts: { allowDemo?: boolean } = {}): string | null {
  const scan = scanAddress(text, opts);
  return scan && scan.checksumValid ? scan.address : null;
}

// ---------------------------------------------------------------- seed phrase / key guard for chat messages

const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g;
const LIST_NUMBER = /(?:^|\s)\(?\d{1,2}[.):]\s*/g;
const HEX64 = /(?<![0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/;
const B58C = "[1-9A-HJ-NP-Za-km-z]";
const WIF = new RegExp(`(?<!${B58C})(?:5${B58C}{50}|[KLc]${B58C}{51}|9${B58C}{50})(?!${B58C})`);
const XPRV = new RegExp(`\\b[xyzt]prv${B58C}{100,112}\\b`);
const SEED_LENGTHS = [12, 15, 18, 21, 24];

/**
 * A key split into pieces by spaces, hyphens or other separators, inside any sentence: consecutive hex-only pieces
 * adding up to 64+ characters, or consecutive base58 pieces that join into exactly a WIF / extended private key.
 */
function hasSplitKey(text: string): boolean {
  const parts = text.split(/[\s\-_.,:;]+/).filter(Boolean);
  let hex = "";
  let b58: string[] = [];
  /** Any run of 2+ consecutive base58 pieces (words around the key allowed) that joins into exactly a key. */
  const flushB58 = (): boolean => {
    const run = b58;
    b58 = [];
    for (let i = 0; i < run.length - 1; i++) {
      let joined = run[i];
      for (let j = i + 1; j < run.length && joined.length <= 120; j++) {
        joined += run[j];
        const digits = (joined.match(/[0-9]/g) ?? []).length;
        if (digits >= 2 && /[A-Z]/.test(joined) && isKeyShaped(joined)) return true;
      }
    }
    return false;
  };
  for (const raw of parts) {
    const part = raw.replace(/^0x/i, "");
    if (/^[0-9a-fA-F]+$/.test(part)) {
      hex += part;
      if (hex.length >= 64) return true;
    } else {
      hex = "";
    }
    if (new RegExp(`^${B58C}+$`).test(raw)) b58.push(raw);
    else if (flushB58()) return true;
  }
  return flushB58();
}

/**
 * True when a chat message contains something shaped like a seed phrase or a private key: a run of 12 or
 * more BIP-39 words, a message that is exactly 12/15/18/21/24 lowercase words that mostly come from the
 * BIP-39 list (tolerates one or two typos), a 64-hex key, a WIF key or an extended private key.
 * When this is true the caller must not send, store or log the message.
 */
export function messageHasSecret(message: string): boolean {
  if (looksLikeSecret(message)) return true;
  const text = message.normalize("NFKC").replace(INVISIBLE, "").replace(LIST_NUMBER, " ");
  if (HEX64.test(text) || WIF.test(text) || XPRV.test(text)) return true;
  if (hasSplitKey(text)) return true;

  const tokens = text
    .toLowerCase()
    .split(/[\s,;.\-]+/)
    .filter(Boolean);
  let run = 0;
  for (const tok of tokens) {
    run = BIP39_WORDS.has(tok) ? run + 1 : 0;
    if (run >= 12) return true;
  }
  if (SEED_LENGTHS.includes(tokens.length) && tokens.every((t) => /^[a-z]+$/.test(t))) {
    const inList = tokens.filter((t) => BIP39_WORDS.has(t)).length;
    if (inList / tokens.length >= 0.75) return true;
  }
  return false;
}
