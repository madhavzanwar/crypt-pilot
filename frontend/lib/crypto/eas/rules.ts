import type { CheckResponse } from "@/lib/crypto/api/types";
import { EASSCAN_URL } from "@/lib/crypto/env";

/**
 * Light, dependency-free attestation rules (safe to import from the main bundle). The heavy part
 * (SchemaEncoder, EAS contract call) lives in ./attest.ts and is loaded only when the user signs.
 *
 * COMPATIBILITY: the schema string and field encoding below are byte-for-byte what Cryptiq registers/uses
 * (cryptiq/frontend/src/lib/eas), so attestations made here can be read by Cryptiq's verifier and vice versa.
 */

/** The EAS schema registered once at https://base-sepolia.easscan.org/schema/create (testnet). */
export const SCHEMA = "string subjectAddress,string chain,uint8 riskScore,string verdict,bytes32 reportHash";

export interface AttestFields {
  /** Wallet check: the checked Bitcoin address. Statement: "finpilot-monthly-statement:<period>". */
  subjectAddress: string;
  /** Wallet check: "bitcoin". Statement: "finpilot". */
  chain: string;
  /** 0-100, fits uint8. Wallet check: risk score. Statement: financial health score (higher = healthier). */
  riskScore: number;
  /** Wallet check: ALLOW | WARN | BLOCK. Statement: "STATEMENT_ANCHOR". */
  verdict: string;
  /** 0x + 32 bytes hex. */
  reportHash: string;
}

/**
 * Only results with evidence are attested: status "ok", a verdict other than UNKNOWN, and a score.
 * UNKNOWN / not_in_dataset mean "we have no evidence", and a permanent on-chain record of "no evidence" would
 * read as a clean bill of health, which is exactly the false assurance this product must never give.
 */
export function canAttest(result: CheckResponse): boolean {
  return result.status === "ok" && result.verdict !== "UNKNOWN" && result.riskScore !== null;
}

export const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
export const isBytes32 = (s: string): boolean => BYTES32_RE.test(s);

/** `result.reportHash` when the backend sent a valid one; otherwise the caller must compute it. */
export function reportHashOf(result: CheckResponse): string | null {
  return result.reportHash && isBytes32(result.reportHash) ? result.reportHash.toLowerCase() : null;
}

export function fieldsFor(result: CheckResponse, reportHash: string): AttestFields {
  const score = Math.round(result.riskScore ?? 0);
  return {
    subjectAddress: result.address,
    chain: result.chain,
    riskScore: Math.min(100, Math.max(0, score)),
    verdict: result.verdict,
    reportHash,
  };
}

export const attestationUrl = (uid: string): string => `${EASSCAN_URL}/attestation/view/${uid}`;

/** Public Base Sepolia (test network) endpoints. Read-only use; no keys involved. */
export const BASESCAN_URL = "https://sepolia.basescan.org";
export const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
export const txUrl = (hash: string): string => `${BASESCAN_URL}/tx/${hash}`;

/** Thrown before any attestation call is built when the browser's recomputed hash differs from the expected one. */
export class HashMismatchError extends Error {
  readonly local: string;
  readonly backend: string;
  constructor(local: string, backend: string) {
    super("report hash mismatch");
    this.name = "HashMismatchError";
    this.local = local;
    this.backend = backend;
  }
}

export type AttestErrorKind =
  | "rejected"
  | "wrong_network"
  | "insufficient_funds"
  | "schema"
  | "hash_mismatch"
  | "other";

/** i18n key + English default for each failure (FinPilot `t(key, default)`). */
export const ATTEST_ERROR_TEXT: Record<AttestErrorKind, { key: string; text: string }> = {
  rejected: { key: "web3.error.rejected", text: "You cancelled the request in your wallet. Nothing was sent." },
  wrong_network: {
    key: "web3.error.wrongNetwork",
    text: "Your wallet is on a different network. Switch to Base Sepolia (testnet) and try again.",
  },
  insufficient_funds: {
    key: "web3.error.funds",
    text: "Not enough Base Sepolia test ETH to pay the network fee. Get free test ETH from a faucet, then retry.",
  },
  schema: {
    key: "web3.error.schema",
    text: "The configured EAS schema was not found on Base Sepolia. The site owner needs to check the schema setting.",
  },
  hash_mismatch: {
    key: "web3.error.hashMismatch",
    text: "The hash recomputed in your browser does not match the expected hash. Nothing was signed.",
  },
  other: { key: "web3.error.other", text: "Something went wrong. Nothing was recorded. Please try again." },
};

/** Flattens an unknown thrown value (ethers, viem, wagmi, plain) into searchable text. */
function describe(e: unknown, depth = 0): string {
  if (e === null || e === undefined || depth > 4) return "";
  if (typeof e === "string") return e;
  if (typeof e === "number") return String(e);
  if (typeof e !== "object") return "";
  const o = e as Record<string, unknown>;
  return ["code", "name", "message", "shortMessage", "reason", "details"]
    .map((k) => describe(o[k], depth + 1))
    .concat(describe(o.cause, depth + 1), describe(o.info, depth + 1), describe(o.error, depth + 1))
    .join(" ");
}

/** Maps any failure to one of a few friendly cases. */
export function classifyAttestError(e: unknown): { kind: AttestErrorKind } {
  if (e instanceof HashMismatchError) return { kind: "hash_mismatch" };
  const text = describe(e);
  let kind: AttestErrorKind = "other";
  if (
    /ACTION_REJECTED|UserRejectedRequest|user rejected|user denied|rejected the request|request rejected|\b4001\b/i.test(
      text,
    )
  )
    kind = "rejected";
  else if (
    /INSUFFICIENT_FUNDS|insufficient funds|exceeds the balance|gas required exceeds|InsufficientFunds/i.test(text)
  )
    kind = "insufficient_funds";
  else if (
    /chain mismatch|wrong network|does not match the target chain|ChainMismatch|network changed|NETWORK_ERROR|unsupported chain|ChainNotConfigured/i.test(
      text,
    )
  )
    kind = "wrong_network";
  else if (/InvalidSchema|schema not found|unknown schema|SchemaNotFound/i.test(text)) kind = "schema";
  return { kind };
}
