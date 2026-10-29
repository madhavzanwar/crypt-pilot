/**
 * Client-side address checks: format AND checksum (base58check for 1... / 3..., bech32 / bech32m for bc1...), so the green
 * "Format looks valid" hint is never shown for a typo (BUG-104). The backend still has the final say.
 * Invisible characters (zero-width space etc.) around or inside the text are dropped (BUG-105).
 * `DEMO-…` placeholders (the synthetic fixture) are accepted only when `allowDemo` is true.
 */
import { isValidBase58Check, isValidSegwit } from "@/lib/crypto/address/checksum";
import { stripInvisible } from "@/lib/crypto/address/seedGuard";

export type AddressKind = "p2pkh" | "p2sh" | "bech32" | "demo";

export type AddressCheck =
  | { ok: true; kind: AddressKind; address: string }
  | { ok: false; reason: "empty" | "format" | "mixed_case" | "checksum" };

const LEGACY = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
const BECH32 = /^bc1[ac-hj-np-z02-9]{11,87}$/i;
const DEMO = /^DEMO-[A-Za-z0-9][A-Za-z0-9-]{1,40}$/;

export function validateAddress(raw: string, opts: { allowDemo?: boolean } = {}): AddressCheck {
  const address = stripInvisible(raw).trim();
  if (address === "") return { ok: false, reason: "empty" };
  if (opts.allowDemo && DEMO.test(address)) return { ok: true, kind: "demo", address };
  if (LEGACY.test(address)) {
    if (!isValidBase58Check(address)) return { ok: false, reason: "checksum" };
    return { ok: true, kind: address.startsWith("1") ? "p2pkh" : "p2sh", address };
  }
  if (BECH32.test(address)) {
    if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
      return { ok: false, reason: "mixed_case" };
    }
    if (!isValidSegwit(address)) return { ok: false, reason: "checksum" };
    return { ok: true, kind: "bech32", address: address.toLowerCase() };
  }
  return { ok: false, reason: "format" };
}

/** Pulls the first thing that looks like an address out of free text (used for browser speech). */
export function extractAddress(text: string, opts: { allowDemo?: boolean } = {}): string | null {
  const squashed = text.replace(/[\s,.;]+/g, " ").trim();
  const candidates = squashed.split(" ");
  for (const c of candidates) if (validateAddress(c, opts).ok) return c;
  // Spoken addresses often arrive with spaces between characters: try the text with spaces removed.
  const joined = squashed.replace(/ /g, "");
  const m =
    joined.match(/bc1[ac-hj-np-z02-9]{11,87}/i) ??
    joined.match(/[13][1-9A-HJ-NP-Za-km-z]{25,34}/) ??
    (opts.allowDemo ? joined.match(/DEMO-[A-Za-z0-9][A-Za-z0-9-]{1,40}/) : null);
  if (!m) return null;
  return validateAddress(m[0], opts).ok ? m[0] : null;
}

/** First 6 and last 6 characters for tight spaces; the full value goes in a title/tooltip. */
export function shortAddress(address: string, head = 6, tail = 6): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}
