import { ApiError } from "./errors";
import {
  type Schema,
  benchmarkJobSchema,
  benchmarkResponseSchema,
  benchmarkRunSchema,
  checkoutResponseSchema,
  checkResponseSchema,
  creditsResponseSchema,
  cryptoInvoiceSchema,
  demoWalletsResponseSchema,
  errorBodySchema,
  healthResponseSchema,
  invoiceStatusSchema,
  transcribeResponseSchema,
} from "./schemas";
import type {
  BenchmarkJob,
  BenchmarkResponse,
  BenchmarkRun,
  CheckoutResponse,
  CheckResponse,
  CreditsResponse,
  CryptoCoin,
  CryptoInvoice,
  DemoWalletsResponse,
  HealthResponse,
  InvoiceStatus,
  Lang,
  TranscribeResponse,
} from "./types";

export interface ApiClientOptions {
  /** "" for same origin (Next.js rewrites `/api/*`), or e.g. "https://api.example.com". */
  baseUrl: string;
  /** Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  check(address: string, lang: Lang, opts?: RequestOptions): Promise<CheckResponse>;
  transcribe(audio: Blob, lang: Lang, opts?: RequestOptions): Promise<TranscribeResponse>;
  credits(opts?: RequestOptions): Promise<CreditsResponse>;
  checkout(packId: string, opts?: RequestOptions): Promise<CheckoutResponse>;
  createInvoice(packId: string, coin: CryptoCoin, opts?: RequestOptions): Promise<CryptoInvoice>;
  invoiceStatus(id: string, opts?: RequestOptions): Promise<InvoiceStatus>;
  demoWallets(opts?: RequestOptions): Promise<DemoWalletsResponse>;
  benchmark(opts?: RequestOptions): Promise<BenchmarkResponse>;
  runBenchmark(sampleSize: number, opts?: RequestOptions): Promise<BenchmarkRun>;
  benchmarkJob(id: string, opts?: RequestOptions): Promise<BenchmarkJob>;
  health(opts?: RequestOptions): Promise<HealthResponse>;
}

/** `buildUrl("", "/api/x")` is `/api/x`; a trailing slash on the base is ignored. */
export function buildUrl(baseUrl: string, path: string): string {
  // CryptPilot: the crypto service is mounted at /api/crypto/* on the FinPilot backend, so the service's own
  // "/api/check" becomes "/api/crypto/check" (this keeps it clear of FinPilot's /api/chat, /api/health, ...).
  return baseUrl.replace(/\/+$/, "") + path.replace(/^\/api(?=\/)/, "");
}

/** Wrapped so the browser's `fetch` is never called with a foreign `this`. */
export function resolveFetch(options: ApiClientOptions): typeof fetch {
  return options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
}

/** fetch() or body-reading failed: abort, or no usable network. */
export function transportError(e: unknown, signal?: AbortSignal): ApiError {
  const aborted = signal?.aborted === true || (e instanceof Error && e.name === "AbortError");
  return new ApiError({
    status: 0,
    code: aborted ? "aborted" : "network_error",
    detail: e instanceof Error ? e.message : undefined,
  });
}

async function readJson(res: Response, signal?: AbortSignal): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    throw transportError(e, signal);
  }
  try {
    return text === "" ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Turns a non-2xx response into an ApiError. Bodies are `{ "error": code }`; a 503 may instead carry a
 * full CheckResponse with status "error" (e.g. graph_unavailable), which is kept on `error.body`.
 */
export async function failureFromResponse(res: Response, signal?: AbortSignal): Promise<ApiError> {
  const json = await readJson(res, signal);
  const asCheck = checkResponseSchema.safeParse(json);
  if (asCheck.success && asCheck.data.status === "error") {
    return new ApiError({
      status: res.status,
      code: asCheck.data.error ?? "service_not_ready",
      body: asCheck.data,
    });
  }
  const asError = errorBodySchema.safeParse(json);
  return new ApiError({ status: res.status, code: asError.success ? asError.data.error : `http_${res.status}` });
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = resolveFetch(options);

  async function send<T>(
    path: string,
    init: RequestInit,
    schema: Schema<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(buildUrl(options.baseUrl, path), { ...init, credentials: "include", signal });
    } catch (e) {
      throw transportError(e, signal);
    }
    if (!res.ok) throw await failureFromResponse(res, signal);
    const json = await readJson(res, signal);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError({ status: res.status, code: "invalid_response", detail: parsed.error.message });
    }
    return parsed.data;
  }

  const get = <T>(path: string, schema: Schema<T>, opts?: RequestOptions) =>
    send(path, { method: "GET", headers: { accept: "application/json" } }, schema, opts?.signal);

  const post = <T>(path: string, body: unknown, schema: Schema<T>, opts?: RequestOptions) =>
    send(
      path,
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      schema,
      opts?.signal,
    );

  return {
    check: (address, lang, opts) => post("/api/check", { address, lang }, checkResponseSchema, opts),

    transcribe(audio, lang, opts) {
      const form = new FormData(); // no content-type header: the browser adds the multipart boundary
      form.append("audio", audio, `audio.${extensionFor(audio.type)}`);
      form.append("lang", lang);
      return send("/api/transcribe", { method: "POST", body: form }, transcribeResponseSchema, opts?.signal);
    },

    credits: (opts) => get("/api/credits", creditsResponseSchema, opts),
    checkout: (packId, opts) => post("/api/checkout", { packId }, checkoutResponseSchema, opts),
    createInvoice: (packId, coin, opts) => post("/api/crypto-invoice", { packId, coin }, cryptoInvoiceSchema, opts),
    invoiceStatus: (id, opts) => get(`/api/crypto-invoice/${encodeURIComponent(id)}`, invoiceStatusSchema, opts),
    demoWallets: (opts) => get("/api/demo-wallets", demoWalletsResponseSchema, opts),
    benchmark: (opts) => get("/api/benchmark", benchmarkResponseSchema, opts),
    runBenchmark: (sampleSize, opts) => post("/api/benchmark/run", { sampleSize }, benchmarkRunSchema, opts),
    benchmarkJob: (id, opts) => get(`/api/benchmark/job/${encodeURIComponent(id)}`, benchmarkJobSchema, opts),
    health: (opts) => get("/api/health", healthResponseSchema, opts),
  };
}

/** Backend accepts webm/ogg/wav/mp4 and looks at the part's content type. */
function extensionFor(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}
