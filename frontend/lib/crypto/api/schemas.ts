import { z } from "zod";
import type {
  BenchmarkJob,
  BenchmarkResponse,
  BenchmarkRun,
  CheckoutResponse,
  CheckResponse,
  Counts,
  CreditsResponse,
  CryptoInvoice,
  DemoWalletsResponse,
  ErrorBody,
  HealthResponse,
  InvoiceStatus,
  StepEvent,
  StreamErrorEvent,
  TranscribeResponse,
} from "./types";

/*
 * Objects are not `.strict()`: unknown extra fields are tolerated (and dropped from the output).
 * Optional fields accept a missing key or `null` and come out as `undefined`; required-but-nullable
 * fields (riskScore, datasetLabel, hopsToNearestIllicit) must be present and are `.nullable()`.
 */
export type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

const opt = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v): z.output<T> | undefined => v ?? undefined);

const verdict = z.enum(["ALLOW", "WARN", "BLOCK", "UNKNOWN"]);
const nodeLabel = z.enum(["illicit", "licit", "unknown"]);
const voiceProvider = z.enum(["wispr", "sarvam", "browser"]);

const counts: Schema<Counts> = z.object({
  illicit: z.number(),
  licit: z.number(),
  unknown: z.number(),
});

export const checkResponseSchema: Schema<CheckResponse> = z.object({
  isMock: opt(z.boolean()),
  status: z.enum(["ok", "not_in_dataset", "error"]),
  address: z.string(),
  chain: z.literal("bitcoin"),
  verdict,
  riskScore: z.number().nullable(),
  datasetLabel: nodeLabel.nullable(),
  hopsToNearestIllicit: z.number().nullable(),
  neighbors: z.object({ hop1: counts, hop2: counts, hop3: opt(counts) }),
  graphFeatures: z.object({ pagerank: opt(z.number()), componentSize: opt(z.number()) }),
  labelHits: z.object({ ofac: z.boolean(), ransomwhere: z.boolean() }),
  topReasons: z.array(z.string()),
  subgraph: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        label: nodeLabel,
        hop: z.number(),
        isSubject: opt(z.boolean()),
        riskScore: opt(z.number()),
      }),
    ),
    links: z.array(z.object({ source: z.string(), target: z.string(), amountBtc: opt(z.number()) })),
  }),
  tigergraph: z.object({ queryName: z.string(), ms: z.number(), gsql: opt(z.string()) }),
  model: z.object({ name: z.string(), illicitF1Test: z.number().nullish() }),
  explanation: z.object({ en: z.string(), hi: z.string() }),
  audioUrl: z.string().nullish(),
  limitations: z.array(z.string()),
  reportHash: opt(z.string()),
  creditsRemaining: opt(z.number()),
  error: opt(z.string()),
  cached: opt(z.boolean()),
  engine: opt(z.enum(["tigergraph", "networkx", "replay"])),
  replay: opt(z.boolean()),
  truncated: opt(z.boolean()),
});

export const transcribeResponseSchema: Schema<TranscribeResponse> = z.object({
  text: z.string(),
  address: z.string().nullable(),
  provider: voiceProvider,
});

export const creditsResponseSchema: Schema<CreditsResponse> = z.object({
  balance: z.number(),
  packs: z.array(
    z.object({ id: z.string(), credits: z.number(), priceUsd: z.number(), label: z.string() }),
  ),
});

export const checkoutResponseSchema: Schema<CheckoutResponse> = z.object({ url: z.string() });

export const cryptoInvoiceSchema: Schema<CryptoInvoice> = z.object({
  invoiceId: z.string(),
  uri: z.string(),
  address: z.string(),
  amount: z.string(),
  coin: z.enum(["btc", "xmr"]),
  expiresAt: z.string(),
  provider: opt(z.enum(["explorer", "demo"])),
});

export const invoiceStatusSchema: Schema<InvoiceStatus> = z.object({
  status: z.enum(["waiting", "paid", "expired"]),
});

export const demoWalletsResponseSchema: Schema<DemoWalletsResponse> = z.object({
  wallets: z.array(z.object({ address: z.string(), note: z.string(), expected: verdict })),
});

export const benchmarkResponseSchema: Schema<BenchmarkResponse> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_measured") }),
  z.object({
    status: z.literal("ok"),
    measuredAt: opt(z.string()),
    sampleSize: z.number(),
    rows: z.array(
      z.object({
        method: z.enum(["raw_dump", "graph_evidence"]),
        inputTokens: z.number(),
        latencyMs: z.number(),
        accuracyPct: z.number(),
      }),
    ),
    models: z.array(
      z.object({
        name: z.enum(["baseline", "with_graph_features"]),
        illicitF1: z.number(),
        precision: z.number(),
        recall: z.number(),
      }),
    ),
  }),
]);

export const benchmarkRunSchema: Schema<BenchmarkRun> = z.object({ jobId: z.string() });

export const benchmarkJobSchema: Schema<BenchmarkJob> = z.object({
  status: z.enum(["running", "done", "failed"]),
  progress: z.number(),
  error: opt(z.string()),
});

export const healthResponseSchema: Schema<HealthResponse> = z.object({
  ok: z.boolean(),
  voiceProvider,
  mocks: opt(z.boolean()),
  engine: opt(z.string()),
  engineOk: opt(z.boolean()),
  modelLoaded: opt(z.boolean()),
  llmConfigured: opt(z.boolean()),
  dataSource: opt(z.string()),
});

export const errorBodySchema: Schema<ErrorBody> = z.object({ error: z.string() });

export const stepEventSchema: Schema<StepEvent> = z.object({ id: z.string(), label: z.string() });

export const streamErrorEventSchema: Schema<StreamErrorEvent> = z.object({
  error: z.string(),
  status: z.number().catch(500),
});
