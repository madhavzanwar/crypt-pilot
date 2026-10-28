/**
 * Types mirroring docs/api-contract.md (and the backend models in docs/openapi.json).
 * Optional (`?`) fields are omitted by the backend when unset. Required-but-nullable fields
 * (riskScore, datasetLabel, hopsToNearestIllicit) are always present and may be `null`.
 */

export type Verdict = "ALLOW" | "WARN" | "BLOCK" | "UNKNOWN";
export type NodeLabel = "illicit" | "licit" | "unknown";
export type Lang = "en" | "hi";
export type Engine = "tigergraph" | "networkx" | "replay";
export type VoiceProvider = "wispr" | "sarvam" | "browser";
export type CryptoCoin = "btc" | "xmr";

export type Counts = { illicit: number; licit: number; unknown: number };

export interface GraphNode {
  id: string;
  label: NodeLabel;
  hop: number;
  isSubject?: boolean;
  riskScore?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  amountBtc?: number;
}

export interface Neighbors {
  hop1: Counts;
  hop2: Counts;
  hop3?: Counts;
}

export interface GraphFeatures {
  pagerank?: number;
  componentSize?: number;
}

export interface LabelHits {
  ofac: boolean;
  ransomwhere: boolean;
}

export interface TigerGraphInfo {
  /** Describes the engine that answered; show the TigerGraph badge only when `engine === "tigergraph"`. */
  queryName: string;
  ms: number;
  gsql?: string;
}

export interface ModelInfo {
  name: string;
  illicitF1Test?: number | null;
}

export interface Explanation {
  en: string;
  hi: string;
}

export interface CheckResponse {
  isMock?: boolean;
  status: "ok" | "not_in_dataset" | "error";
  address: string;
  chain: "bitcoin";
  verdict: Verdict;
  /** 0-100, null when the wallet is not in the dataset. */
  riskScore: number | null;
  datasetLabel: NodeLabel | null;
  hopsToNearestIllicit: number | null;
  neighbors: Neighbors;
  graphFeatures: GraphFeatures;
  labelHits: LabelHits;
  topReasons: string[];
  subgraph: { nodes: GraphNode[]; links: GraphLink[] };
  tigergraph: TigerGraphInfo;
  model: ModelInfo;
  explanation: Explanation;
  /** Path like `/api/audio/{file}.mp3` on the backend origin. */
  audioUrl?: string | null;
  limitations: string[];
  /** `0x` + keccak256 hex, see reportHash.ts. */
  reportHash?: string;
  creditsRemaining?: number;
  error?: string;

  // ---- backend additions (all optional) ----
  /** Served from the 10-minute cache (not charged). */
  cached?: boolean;
  /** Which graph engine answered. */
  engine?: Engine;
  /** Pre-recorded real response (demo safety net). */
  replay?: boolean;
  /** Hub guard cut the k-hop expansion short. */
  truncated?: boolean;
}

export interface TranscribeResponse {
  text: string;
  address: string | null;
  provider: VoiceProvider;
}

export interface CreditPack {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}

export interface CreditsResponse {
  balance: number;
  packs: CreditPack[];
}

export interface CheckoutResponse {
  url: string;
}

export interface CryptoInvoice {
  invoiceId: string;
  uri: string;
  address: string;
  /** Decimal amount as a string (never a float). */
  amount: string;
  coin: CryptoCoin;
  expiresAt: string;
  /** `demo` = Monero, no automatic confirmation. */
  provider?: "explorer" | "demo";
}

export type InvoiceState = "waiting" | "paid" | "expired";

export interface InvoiceStatus {
  status: InvoiceState;
}

export interface DemoWallet {
  address: string;
  note: string;
  expected: Verdict;
}

export interface DemoWalletsResponse {
  wallets: DemoWallet[];
}

export interface BenchmarkRow {
  method: "raw_dump" | "graph_evidence";
  inputTokens: number;
  latencyMs: number;
  accuracyPct: number;
}

export interface BenchmarkModelRow {
  name: "baseline" | "with_graph_features";
  illicitF1: number;
  precision: number;
  recall: number;
}

export type BenchmarkResponse =
  | { status: "not_measured" }
  | {
      status: "ok";
      measuredAt?: string;
      sampleSize: number;
      rows: BenchmarkRow[];
      models: BenchmarkModelRow[];
    };

export interface BenchmarkRun {
  jobId: string;
}

export interface BenchmarkJob {
  status: "running" | "done" | "failed";
  /** 0 to 1. */
  progress: number;
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
  voiceProvider: VoiceProvider;
  mocks?: boolean;
  // optional diagnostics
  engine?: string;
  engineOk?: boolean;
  modelLoaded?: boolean;
  llmConfigured?: boolean;
  dataSource?: string;
}

/** Every backend error body: `{ "error": "<code>" }`. */
export interface ErrorBody {
  error: string;
}

// ---- SSE (POST /api/check/stream) ----

/** Step ids in order: validate, graph, hops, score, explain. */
export interface StepEvent {
  id: string;
  label: string;
}

export interface StreamErrorEvent {
  error: string;
  status: number;
}
