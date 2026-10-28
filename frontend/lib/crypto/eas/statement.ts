import { canonicalJson, type Keccak256Utf8 } from "@/lib/crypto/api/reportHash";
import type { AttestFields } from "./rules";
import type { AttestSubject } from "./subject";

/**
 * Statement attestation payload. HASHES ONLY: no transactions, balances, names or account data are ever part of
 * it. The EAS schema is Cryptiq's 5-field schema (so one registered schema serves both products); the fields are
 * mapped as documented in `statementFields`.
 */

export const STATEMENT_DOC_TYPE = "finpilot-monthly-statement";
export const STATEMENT_CHAIN = "finpilot";
export const STATEMENT_VERDICT = "STATEMENT_ANCHOR";
export const STATEMENT_PAYLOAD_VERSION = 1;

export interface StatementInput {
  /** The audit hash exactly as the statement shows it (see components/statement/auditHash.ts). */
  auditHash: string;
  /** "YYYY-MM". */
  period: string;
  /** Overall financial health score, 0-100. */
  healthScore: number;
}

export interface StatementPayload {
  auditHash: string;
  /** keccak256(utf8(auditHash)), 0x + 32 bytes. Equals auditHash itself when that is already a bytes32. */
  auditHashBytes32: string;
  docType: typeof STATEMENT_DOC_TYPE;
  healthScore: number;
  period: string;
  version: number;
}

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/** The statement's audit hash as bytes32: itself when it already is one, otherwise keccak256 of its text. */
export function auditHashBytes32(auditHash: string, keccak: Keccak256Utf8): string {
  return BYTES32.test(auditHash) ? auditHash.toLowerCase() : keccak(auditHash).toLowerCase();
}

const clampScore = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

export function statementPayload(input: StatementInput, keccak: Keccak256Utf8): StatementPayload {
  return {
    auditHash: input.auditHash,
    auditHashBytes32: auditHashBytes32(input.auditHash, keccak),
    docType: STATEMENT_DOC_TYPE,
    healthScore: clampScore(input.healthScore),
    period: input.period,
    version: STATEMENT_PAYLOAD_VERSION,
  };
}

/** keccak256 of the canonical (sorted-key, no-whitespace) JSON of the payload, 0x + 32 bytes. */
export function statementHash(input: StatementInput, keccak: Keccak256Utf8): string {
  const h = keccak(canonicalJson(statementPayload(input, keccak)));
  return (h.startsWith("0x") ? h : `0x${h}`).toLowerCase();
}

/**
 * Field mapping onto Cryptiq's schema (string subjectAddress, string chain, uint8 riskScore, string verdict,
 * bytes32 reportHash): subject = "<docType>:<period>", chain = "finpilot", riskScore = health score (here HIGHER IS
 * BETTER, unlike a wallet risk score), verdict = "STATEMENT_ANCHOR", reportHash = statementHash.
 */
export function statementFields(input: StatementInput, hash: string): AttestFields {
  return {
    subjectAddress: `${STATEMENT_DOC_TYPE}:${input.period}`,
    chain: STATEMENT_CHAIN,
    riskScore: clampScore(input.healthScore),
    verdict: STATEMENT_VERDICT,
    reportHash: hash,
  };
}

export function statementSubject(input: StatementInput): AttestSubject {
  return {
    kind: "statement",
    id: `statement:${input.period}:${input.auditHash}:${clampScore(input.healthScore)}`,
    title: "Monthly health statement",
    hashLabel: "Statement hash",
    rows: [
      { label: "Document type", value: STATEMENT_DOC_TYPE },
      { label: "Period", value: input.period },
      { label: "Health score (0-100, higher is healthier)", value: String(clampScore(input.healthScore)) },
      { label: "Audit hash as printed", value: input.auditHash, mono: true },
    ],
    privacyNote:
      "Published on-chain: the document type, period, health score and hashes only. No transactions, balances, names or account details. Your connected wallet address becomes the attester. Public and permanent.",
    expectedHash: null,
    acceptRawInput: true,
    hashOf: (keccak) => statementHash(input, keccak),
    candidates: (keccak) => [
      { label: "Statement hash", hash: statementHash(input, keccak) },
      { label: "Audit hash (keccak256)", hash: auditHashBytes32(input.auditHash, keccak) },
    ],
    fieldsFor: (hash) => statementFields(input, hash),
  };
}
