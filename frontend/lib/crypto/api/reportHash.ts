import type { CheckResponse, Counts, NodeLabel, Verdict } from "./types";

/*
 * reportHash = "0x" + hex(keccak256(utf8(canonicalJson(evidence)))), see docs/api-contract.md.
 * This module never imports a hashing library: pass the keccak function in.
 */

const utf8 = new TextEncoder();

/** UTF-8 byte order equals code point order (what the backend's Python `sort_keys` does). */
function compareKeys(a: string, b: string): number {
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * JSON with keys sorted recursively, no whitespace and non-ASCII characters kept as-is.
 * Only strings, safe integers, booleans, null, arrays and plain objects are allowed:
 * floats (and undefined, NaN, bigint, ...) throw, pre-format them as strings.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("floats are not allowed in canonical evidence; pre-format them as strings");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError("only plain objects are allowed");
    const entries = Object.entries(value).sort(([a], [b]) => compareKeys(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new TypeError(`unsupported value in canonical evidence: ${typeof value}`);
}

export interface Evidence {
  address: string;
  chain: "bitcoin";
  dataset: string;
  datasetLabel: NodeLabel | null;
  hopsToNearestIllicit: number | null;
  labelHits: { ofac: boolean; ransomwhere: boolean };
  model: string;
  neighbors: { hop1: Counts; hop2: Counts; hop3: Counts | null };
  /** 8 decimals, as a string. */
  pagerank: string | null;
  componentSize: number | null;
  riskScore: number | null;
  verdict: Verdict;
}

const pickCounts = (c: Counts): Counts => ({ illicit: c.illicit, licit: c.licit, unknown: c.unknown });

/**
 * The evidence object the backend hashed. `dataset` is "elliptic++", or "synthetic_fixture" when the
 * response has `isMock: true` (the backend puts its data source there). Pass `dataset` to override.
 */
export function evidenceFor(response: CheckResponse, opts: { dataset?: string } = {}): Evidence {
  const { pagerank, componentSize } = response.graphFeatures;
  const { hop1, hop2, hop3 } = response.neighbors;
  return {
    address: response.address,
    chain: response.chain,
    dataset: opts.dataset ?? (response.isMock === true ? "synthetic_fixture" : "elliptic++"),
    datasetLabel: response.datasetLabel,
    hopsToNearestIllicit: response.hopsToNearestIllicit,
    labelHits: { ofac: response.labelHits.ofac, ransomwhere: response.labelHits.ransomwhere },
    model: response.model.name,
    neighbors: { hop1: pickCounts(hop1), hop2: pickCounts(hop2), hop3: hop3 ? pickCounts(hop3) : null },
    pagerank: pagerank === undefined ? null : pagerank.toFixed(8),
    componentSize: componentSize ?? null,
    riskScore: response.riskScore,
    verdict: response.verdict,
  };
}

export type Keccak256Utf8 = (s: string) => string;

const with0x = (hex: string): string => (hex.startsWith("0x") ? hex : `0x${hex}`).toLowerCase();

/** Recomputes the hash from the response. `keccak256Utf8` may return hex with or without `0x`. */
export function computeReportHash(
  response: CheckResponse,
  keccak256Utf8: Keccak256Utf8,
  opts: { dataset?: string } = {},
): string {
  return with0x(keccak256Utf8(canonicalJson(evidenceFor(response, opts))));
}

/** True when `response.reportHash` matches the evidence in the response. False if there is no hash. */
export function verifyReportHash(
  response: CheckResponse,
  keccak256Utf8: Keccak256Utf8,
  opts: { dataset?: string } = {},
): boolean {
  if (response.reportHash === undefined) return false;
  return with0x(response.reportHash) === computeReportHash(response, keccak256Utf8, opts);
}
