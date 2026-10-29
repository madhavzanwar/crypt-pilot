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

// ---------------------------------------------------------------- SHA-256 (small, sync; only for base58check)

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74,
  0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
  0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(data: ArrayLike<number>): number[] {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes: number[] = Array.from(data);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  for (const v of [hi, lo]) bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const w = new Array<number>(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  const out: number[] = [];
  for (const v of h) out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  return out;
}

// ---------------------------------------------------------------- base58check (1... and 3...)

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): number[] | null {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return bytes.reverse();
}

/** Mainnet P2PKH (version 0x00) or P2SH (0x05) with a valid double-SHA-256 checksum. */
export function isValidBase58Check(address: string): boolean {
  const raw = base58Decode(address);
  if (!raw || raw.length !== 25) return false;
  if (raw[0] !== 0x00 && raw[0] !== 0x05) return false;
  const sum = sha256(sha256(raw.slice(0, 21)));
  return sum[0] === raw[21] && sum[1] === raw[22] && sum[2] === raw[23] && sum[3] === raw[24];
}

// ---------------------------------------------------------------- bech32 / bech32m (bc1...)

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

/** Mainnet segwit address: bech32 for witness v0 (bc1q...), bech32m for v1+ (bc1p...). */
export function isValidSegwit(address: string): boolean {
  if (address.length < 14 || address.length > 90) return false;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false;
  const s = address.toLowerCase();
  if (!s.startsWith("bc1")) return false;
  const data: number[] = [];
  for (const ch of s.slice(3)) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return false;
    data.push(v);
  }
  const hrpExpanded = [3, 3, 0, 2, 3]; // "bc" expanded: high bits (b=98, c=99 -> 3,3), 0, low bits (2,3)
  const sum = polymod([...hrpExpanded, ...data]);
  const version = data[0];
  if (version > 16) return false;
  if (sum !== (version === 0 ? BECH32_CONST : BECH32M_CONST)) return false;
  // 5-bit groups -> bytes, no padding allowed
  let acc = 0;
  let bits = 0;
  let count = 0;
  for (const v of data.slice(1, -6)) {
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      acc &= (1 << bits) - 1;
      count++;
    }
  }
  if (bits >= 5 || acc !== 0) return false;
  if (count < 2 || count > 40) return false;
  return version !== 0 || count === 20 || count === 32;
}

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
