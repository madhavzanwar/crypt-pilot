import { computeReportHash, evidenceFor, type Keccak256Utf8 } from "@/lib/crypto/api/reportHash";
import type { CheckResponse } from "@/lib/crypto/api/types";
import { fieldsFor, reportHashOf, type AttestFields } from "./rules";

/**
 * An AttestSubject is "what is being anchored": the rows shown to the person (exactly the data that is hashed
 * and published), the hash recomputed locally from those rows, and the fields written on-chain. Both the wallet
 * check result and the monthly statement are subjects, so one flow (stepper, sign, verify) serves both.
 * Light module: no ethers/viem, keccak is passed in.
 */

export interface SubjectRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface HashCandidate {
  label: string;
  hash: string;
}

export interface AttestSubject {
  kind: "wallet-check" | "statement";
  /** Stable key, so UI state resets when the subject changes. */
  id: string;
  title: string;
  hashLabel: string;
  /** What will be public if the person signs. */
  rows: SubjectRow[];
  /** One-sentence privacy statement shown above the sign button. */
  privacyNote: string;
  /** An independent hash to cross-check the local recomputation against (backend's report hash), or null. */
  expectedHash: string | null;
  /** Whether the "verify a hash" field also accepts non-hex text and derives keccak256 of it. */
  acceptRawInput: boolean;
  /** When set, the person must tick this acknowledgement before a real attestation can be signed. */
  requiresAck?: string;
  /** Hash recomputed from the displayed data. */
  hashOf(keccak: Keccak256Utf8): string;
  /** Every hash a verifier might legitimately paste (the main hash first). */
  candidates(keccak: Keccak256Utf8): HashCandidate[];
  /** The five on-chain fields for a given (already validated) hash. */
  fieldsFor(hash: string): AttestFields;
}

/** Wallet-check subject: identical evidence/hash/fields as Cryptiq. */
export function walletSubject(result: CheckResponse): AttestSubject {
  const ev = evidenceFor(result);
  return {
    kind: "wallet-check",
    id: `wallet:${result.address}:${result.reportHash ?? ""}`,
    title: "Wallet check result",
    hashLabel: "Report hash",
    rows: [
      { label: "Bitcoin address", value: result.address, mono: true },
      { label: "Chain", value: result.chain },
      { label: "Verdict", value: result.verdict },
      { label: "Risk score (0-100)", value: String(Math.round(result.riskScore ?? 0)) },
      { label: "Dataset", value: result.isMock === true ? "synthetic fixture (demo data)" : ev.dataset },
    ],
    privacyNote:
      "Published on-chain: the checked address, verdict, risk score and the report hash. Your connected wallet address becomes the attester. Public and permanent.",
    expectedHash: reportHashOf(result),
    acceptRawInput: false,
    requiresAck:
      result.isMock === true
        ? "I understand this result comes from a synthetic demo dataset, not real wallet intelligence; the attestation only proves the hash of that demo data."
        : undefined,
    hashOf: (keccak) => computeReportHash(result, keccak),
    candidates: (keccak) => [{ label: "Report hash", hash: computeReportHash(result, keccak) }],
    fieldsFor: (hash) => fieldsFor(result, hash),
  };
}
