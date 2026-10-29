import { computeReportHash, type Keccak256Utf8 } from "@/lib/crypto/api/reportHash";
import type { CheckResponse } from "@/lib/crypto/api/types";
import { isBytes32, reportHashOf, type AttestFields } from "./rules";
import type { AttestSubject } from "./subject";

/**
 * Pure verification logic (no ethers, no network): the keccak function is passed in. "Match" is only ever
 * returned after a real comparison of real values; a missing counterpart is reported as such, never as a match.
 */

export type LocalHashCheck =
  | { outcome: "match"; local: string; backend: string }
  | { outcome: "mismatch"; local: string; backend: string }
  /** Nothing independent to compare against, so this is NOT a match. */
  | { outcome: "no_backend_hash"; local: string };

/** Wallet check: recomputes the report hash from the evidence in `result` and compares it with the backend's. */
export function checkLocalHash(result: CheckResponse, keccak: Keccak256Utf8): LocalHashCheck {
  const local = computeReportHash(result, keccak);
  const backend = reportHashOf(result);
  if (backend === null) return { outcome: "no_backend_hash", local };
  return { outcome: local === backend ? "match" : "mismatch", local, backend };
}

/** Any subject: recompute the hash from the displayed data and compare with its independent expectation, if any. */
export function checkSubjectHash(subject: AttestSubject, keccak: Keccak256Utf8): LocalHashCheck {
  const local = subject.hashOf(keccak);
  const backend = subject.expectedHash;
  if (backend === null) return { outcome: "no_backend_hash", local };
  return { outcome: local === backend ? "match" : "mismatch", local, backend };
}

export type FieldName = keyof AttestFields;
const FIELD_NAMES: FieldName[] = ["subjectAddress", "chain", "riskScore", "verdict", "reportHash"];
export const FIELD_LABEL: Record<FieldName, string> = {
  subjectAddress: "subject",
  chain: "chain",
  riskScore: "score",
  verdict: "verdict",
  reportHash: "hash",
};

export interface OnChainComparison {
  /** "match" only if every field agrees and the attestation is not revoked. */
  outcome: "match" | "mismatch" | "revoked";
  fields: Record<FieldName, boolean>;
  mismatched: FieldName[];
  /** The hash recomputed in the browser from the displayed data. */
  local: string;
}

/**
 * Compares what is stored on-chain (decoded attestation data) with the data displayed now. The stored hash must
 * equal the hash recomputed in the browser AND, when an independent expectation exists, that expectation too.
 */
export function compareOnChain(
  subject: AttestSubject,
  onChain: AttestFields,
  keccak: Keccak256Utf8,
  meta: { revoked?: boolean } = {},
): OnChainComparison {
  const local = subject.hashOf(keccak);
  const expected = subject.fieldsFor(local);
  const stored = onChain.reportHash.toLowerCase();
  const fields: Record<FieldName, boolean> = {
    subjectAddress: onChain.subjectAddress === expected.subjectAddress,
    chain: onChain.chain === expected.chain,
    riskScore: onChain.riskScore === expected.riskScore,
    verdict: onChain.verdict === expected.verdict,
    reportHash: stored === local && (subject.expectedHash === null || subject.expectedHash === local),
  };
  const mismatched = FIELD_NAMES.filter((n) => !fields[n]);
  const outcome = meta.revoked ? "revoked" : mismatched.length === 0 ? "match" : "mismatch";
  return { outcome, fields, mismatched, local };
}

export type EnteredHashCheck =
  | { outcome: "empty" }
  | { outcome: "invalid" }
  | { outcome: "match"; entered: string; matched: string; derived: boolean }
  | { outcome: "mismatch"; entered: string; derived: boolean };

/**
 * "Verify a hash": compares what the person typed with the hashes recomputed locally from the displayed data.
 * A 0x + 32-byte value is compared as is. When the subject accepts raw text (statement audit hash such as
 * "SHA256:..."), anything else is treated as that text and its keccak256 is derived first (`derived: true`).
 */
export function checkEnteredHash(subject: AttestSubject, raw: string, keccak: Keccak256Utf8): EnteredHashCheck {
  const text = raw.trim();
  if (text === "") return { outcome: "empty" };
  let entered: string;
  let derived = false;
  if (isBytes32(text)) entered = text.toLowerCase();
  else if (/^0x/i.test(text) || /^[0-9a-f]{32,}$/i.test(text)) return { outcome: "invalid" }; // hash-shaped but malformed: same answer on every surface
  else if (subject.acceptRawInput) {
    entered = keccak(text).toLowerCase();
    derived = true;
  } else return { outcome: "invalid" };
  const hit = subject.candidates(keccak).find((c) => c.hash === entered);
  return hit ? { outcome: "match", entered, matched: hit.label, derived } : { outcome: "mismatch", entered, derived };
}

export type VerifyErrorKind = "network" | "not_found" | "other";

export class VerifyError extends Error {
  readonly kind: VerifyErrorKind;
  constructor(kind: VerifyErrorKind, message: string = kind) {
    super(message);
    this.name = "VerifyError";
    this.kind = kind;
  }
}

/** Turns any failure while reading the chain into one of three user-facing cases. */
export function classifyVerifyError(e: unknown): VerifyErrorKind {
  if (e instanceof VerifyError) return e.kind;
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/fetch|network|timeout|timed out|ECONN|ENOTFOUND|SERVER_ERROR|failed to detect|could not coalesce|503|502|429/i.test(text))
    return "network";
  return "other";
}
