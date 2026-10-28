import { computeReportHash } from "@/lib/crypto/api/reportHash";
import type { CheckResponse } from "@/lib/crypto/api/types";
import { SchemaEncoder, type TransactionSigner } from "@ethereum-attestation-service/eas-sdk";
import { fieldsFor, HashMismatchError, reportHashOf, SCHEMA, type AttestFields } from "./rules";
import { checkLocalHash } from "./verify";

/** Heavy half of the attestation code: loaded with `await import("@/lib/crypto/eas/attest")` only on click. */

export function encodeAttestation(fields: AttestFields): string {
  const encoder = new SchemaEncoder(SCHEMA);
  return encoder.encodeData([
    { name: "subjectAddress", value: fields.subjectAddress, type: "string" },
    { name: "chain", value: fields.chain, type: "string" },
    { name: "riskScore", value: fields.riskScore, type: "uint8" },
    { name: "verdict", value: fields.verdict, type: "string" },
    { name: "reportHash", value: fields.reportHash, type: "bytes32" },
  ]);
}

/** Inverse of encodeAttestation (used by anyone verifying an attestation). */
export function decodeAttestation(data: string): AttestFields {
  const out = new SchemaEncoder(SCHEMA).decodeData(data);
  const get = (name: string): unknown => out.find((i) => i.name === name)?.value.value;
  return {
    subjectAddress: String(get("subjectAddress")),
    chain: String(get("chain")),
    riskScore: Number(get("riskScore")),
    verdict: String(get("verdict")),
    reportHash: String(get("reportHash")),
  };
}

/** The backend's hash when present, else recomputed in the browser from the evidence. */
export async function resolveReportHash(result: CheckResponse): Promise<string> {
  const given = reportHashOf(result);
  if (given) return given;
  const { keccak256, toUtf8Bytes } = await import("ethers");
  return computeReportHash(result, (s) => keccak256(toUtf8Bytes(s)));
}

export interface SubmitFieldsOptions {
  signer: TransactionSigner;
  /** EAS contract address (Base Sepolia predeploy). */
  contract: string;
  schemaUid: string;
  /** The connected user's EVM address. */
  recipient: string;
  fields: AttestFields;
  /** Called with the transaction hash as soon as the wallet has sent it (before it is confirmed). */
  onSubmitted?: (txHash: string) => void;
}

/** Wraps the signer so the transaction hash is reported the moment it is sent. */
export function reportSubmitted(signer: TransactionSigner, onSubmitted?: (hash: string) => void): TransactionSigner {
  if (!onSubmitted) return signer;
  return new Proxy(signer, {
    get(target, prop) {
      if (prop === "sendTransaction") {
        return async (tx: Parameters<TransactionSigner["sendTransaction"]>[0]) => {
          const sent = (await target.sendTransaction(tx)) as { hash?: string };
          if (typeof sent?.hash === "string") onSubmitted(sent.hash);
          return sent;
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** Signs and sends an attestation of already-validated `fields`; waits for the transaction and returns its UID. */
export async function submitFields({
  signer,
  contract,
  schemaUid,
  recipient,
  fields,
  onSubmitted,
}: SubmitFieldsOptions): Promise<string> {
  const { EAS } = await import("@ethereum-attestation-service/eas-sdk");
  const eas = new EAS(contract);
  eas.connect(reportSubmitted(signer, onSubmitted));
  const tx = await eas.attest({
    schema: schemaUid,
    data: { recipient, expirationTime: BigInt(0), revocable: true, data: encodeAttestation(fields) },
  });
  return tx.wait();
}

export interface SubmitOptions extends Omit<SubmitFieldsOptions, "fields"> {
  result: CheckResponse;
}

/**
 * Wallet-check attestation (Cryptiq-compatible). SAFETY: first recomputes the report hash from the evidence and
 * refuses (HashMismatchError) when it differs from the backend's hash, so a wrong hash is never written on-chain.
 */
export async function submitAttestation({ result, ...rest }: SubmitOptions): Promise<string> {
  const { keccak256, toUtf8Bytes } = await import("ethers");
  const check = checkLocalHash(result, (s) => keccak256(toUtf8Bytes(s)));
  if (check.outcome === "mismatch") throw new HashMismatchError(check.local, check.backend);
  const reportHash = check.outcome === "match" ? check.backend : check.local;
  return submitFields({ ...rest, fields: fieldsFor(result, reportHash) });
}
