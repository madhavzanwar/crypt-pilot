/**
 * Verifying the statement's printed audit hash. Pure functions, no React: the page recomputes the SHA-256 of its own
 * canonical JSON and compares it with whatever the person pastes. The printed hash is a SHA-256, so SHA-256 is the
 * only algorithm used here (the on-chain attestation payload has its own keccak256 hash, labelled separately).
 */

export type PastedHash =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "hash"; hex: string };

/** Accepts "0x…", bare hex, "SHA256:…" / "sha-256:…" prefixes, any case, surrounding or inner whitespace. */
export function parsePastedHash(raw: string): PastedHash {
  let s = raw.trim();
  if (s === "") return { kind: "empty" };
  s = s.replace(/^sha-?256\s*[:=]?\s*/i, "").replace(/^0x/i, "").replace(/\s+/g, "");
  return /^[0-9a-f]{64}$/i.test(s) ? { kind: "hash", hex: s.toLowerCase() } : { kind: "invalid" };
}

export type HashVerdict = "empty" | "invalid" | "match" | "mismatch";

export function compareStatementHash(raw: string, recomputedHex: string): HashVerdict {
  const p = parsePastedHash(raw);
  if (p.kind === "empty") return "empty";
  if (p.kind === "invalid") return "invalid";
  return p.hex === recomputedHex.toLowerCase() ? "match" : "mismatch";
}
