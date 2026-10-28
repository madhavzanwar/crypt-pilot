# Cryptiq API contract

Source of truth for the frontend (`/frontend`) and backend (`/backend`). The backend generates
`docs/openapi.json` from the same models (`cd backend && make openapi`).

Rules: changes are **additive and optional only** (never rename or remove a field). Every addition
is listed in "Backend additions" with the date it was added.

## Types

```ts
type Verdict = "ALLOW" | "WARN" | "BLOCK" | "UNKNOWN";
type NodeLabel = "illicit" | "licit" | "unknown";
type Lang = "en" | "hi";
type Counts = { illicit: number; licit: number; unknown: number };

interface GraphNode { id: string; label: NodeLabel; hop: number; isSubject?: boolean; riskScore?: number; }
interface GraphLink { source: string; target: string; amountBtc?: number; }

interface CheckResponse {
  isMock?: boolean;
  status: "ok" | "not_in_dataset" | "error";
  address: string;
  chain: "bitcoin";
  verdict: Verdict;
  riskScore: number | null;                  // 0-100
  datasetLabel: NodeLabel | null;
  hopsToNearestIllicit: number | null;
  neighbors: { hop1: Counts; hop2: Counts; hop3?: Counts };
  graphFeatures: { pagerank?: number; componentSize?: number };
  labelHits: { ofac: boolean; ransomwhere: boolean };
  topReasons: string[];
  subgraph: { nodes: GraphNode[]; links: GraphLink[] };
  tigergraph: { queryName: string; ms: number; gsql?: string };
  model: { name: string; illicitF1Test?: number | null };
  explanation: { en: string; hi: string };
  audioUrl?: string | null;
  limitations: string[];
  reportHash?: string;
  creditsRemaining?: number;
  error?: string;

  // ---- backend additions (optional) ----
  cached?: boolean;                               // served from the 10-minute cache (not charged)
  engine?: "tigergraph" | "networkx" | "replay";  // which graph engine answered
  replay?: boolean;                               // pre-recorded real response (demo safety net)
  truncated?: boolean;                            // hub guard cut the k-hop expansion short
}
```

`tigergraph.ms` is measured inside the engine around the graph query only. When
`engine !== "tigergraph"` the `tigergraph` object still exists (same shape) but describes the engine
that answered (`queryName` like `networkx.khop_exposure`, no `gsql`). Show the TigerGraph badge only
for `engine === "tigergraph"`.

## Endpoints

All JSON unless noted. Errors are always `{ "error": string }` with a proper HTTP status.
All requests must be sent with credentials (`fetch(..., { credentials: "include" })`) so the
session cookie works.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/transcribe` | multipart `audio` (webm/ogg/wav/mp4, ≤5 MB, ≤30 s), `lang` (`en`/`hi`) | `{ text, address \| null, provider: "wispr" \| "sarvam" \| "browser" }` |
| POST | `/api/check` | `{ address, lang }` | `CheckResponse` |
| POST | `/api/check/stream` | `{ address, lang }` | SSE: `event: step` `{id, label}` ×5, then `event: result` (`CheckResponse`) or `event: error` (`{error, status}`) |
| GET | `/api/credits` | – | `{ balance, packs: [{id, credits, priceUsd, label}] }` |
| POST | `/api/checkout` | `{ packId }` | `{ url }` (Dodo test-mode checkout) |
| POST | `/api/crypto-invoice` | `{ packId, coin: "btc" \| "xmr" }` | `{ invoiceId, uri, address, amount, coin, expiresAt, provider? }` |
| GET | `/api/crypto-invoice/{id}` | – | `{ status: "waiting" \| "paid" \| "expired" }` |
| GET | `/api/demo-wallets` | – | `{ wallets: [{ address, note, expected: Verdict }] }` |
| GET | `/api/benchmark` | – | `{ status: "not_measured" }` or `{ status: "ok", measuredAt, sampleSize, rows: [...], models: [...] }` |
| POST | `/api/benchmark/run` | `{ sampleSize }` | `{ jobId }` |
| GET | `/api/benchmark/job/{id}` | – | `{ status: "running" \| "done" \| "failed", progress, error? }` |
| GET | `/api/health` | – | `{ ok: true, voiceProvider, mocks? }` (+ optional diagnostics) |

SSE step ids, in order: `validate` "Validating address", `graph` "Querying TigerGraph",
`hops` "Measuring hops to flagged wallets", `score` "Scoring risk", `explain` "Writing explanation".
When the graph engine is not TigerGraph, the `graph` step label says which engine is used
(e.g. "Querying graph (NetworkX fallback)"), the id stays `graph`.

## Backend additions (all optional / additive)

| Date | Addition |
|---|---|
| 2026-10-28 | `CheckResponse.cached?: boolean`, `engine?: "tigergraph" \| "networkx" \| "replay"`, `replay?: boolean`, `truncated?: boolean` |
| 2026-10-28 | HTTP **402** `{ "error": "no_credits" }` from `/api/check` and `/api/check/stream` (stream: before the stream opens) when the balance is 0 |
| 2026-10-28 | HTTP **400** `{ "error": "secret_input" }` when input looks like a seed phrase or private key (from `/api/check`, `/api/check/stream`, `/api/transcribe`). Show: "Never share your seed phrase or private key." |
| 2026-10-28 | HTTP **400** `{ "error": "invalid_address" }` when the address fails checksum validation |
| 2026-10-28 | HTTP **429** `{ "error": "rate_limited" }`; **503** `{ "error": "voice_unavailable" }` from `/api/transcribe` (fall back to browser speech recognition) |
| 2026-10-28 | Session cookie `cryptiq_sid` (httpOnly, SameSite from env, `Secure` when SameSite=None). New sessions start with `STARTING_CREDITS` (default 3). Send requests with credentials. |
| 2026-10-28 | `/api/crypto-invoice` response `provider?: "explorer" \| "demo"` (`demo` = Monero, no automatic confirmation) |
| 2026-10-28 | `/api/health` optional diagnostics: `engine`, `engineOk`, `modelLoaded`, `llmConfigured`, `dataSource` |
| 2026-10-28 | HTTP **413** `{ "error": "request_too_large" }` (body over 6 MB) / `audio_too_large` / `audio_too_long`; **415** `unsupported_audio_type`; **500** `{ "error": "internal_error" }`; **409** `try_again` (crypto invoice amount clash) / `benchmark_running`; **503** `crypto_unavailable`, `payments_unavailable`, `llm_unavailable`, `model_not_trained`; **422** `invalid request: <fields>` |
| 2026-10-28 | `audioUrl` is a path under `/api/audio/{file}.mp3` on the backend origin |
| 2026-10-28 | `isMock: true` is set when the backend runs on the synthetic fixture dataset (`DEMO-…` addresses), never on Elliptic++ data |

Charging: only `status: "ok"` costs 1 credit. `not_in_dataset`, `error` and `cached: true` are free.

### Wire details clarified (no behaviour change; found while writing the TypeScript client)

- **Required-but-nullable:** `riskScore`, `datasetLabel`, `hopsToNearestIllicit` are always present
  (`null` when unknown). Unset *optional* fields are omitted from the JSON (not sent as `null`).
- **`neighbors.hop3`** is omitted when not computed; the `reportHash` evidence always contains `"hop3": null` then.
- **Always present** on a `CheckResponse` even though `docs/openapi.json` (generated from Python defaults)
  does not list them as required: `chain`, `neighbors`, `graphFeatures`, `labelHits`, `topReasons`,
  `subgraph`, `limitations`, and the three `Counts` fields.
- **`riskScore`** is an integer 0-100 (JSON number). `GraphNode.riskScore` is a number.
- **503 with a body:** if the graph engine fails and no replay exists, `/api/check` returns HTTP 503 with a
  full `CheckResponse` (`status: "error"`, `error: "graph_unavailable"`). On the stream the same
  response arrives as a normal `result` event whose `status` is `"error"`.
- **SSE `error` event** payload: `{ "error": string, "status": number }` (used for a late `no_credits`, 402).
- **`evidence.dataset`** is `"elliptic++"` for real data and `"synthetic_fixture"` when `isMock` is true.
  Pick it from `isMock`, otherwise hashes of fixture responses will not verify.
- **SSE step count:** the normal path emits 5 `step` events; cache hits, replays and error paths emit fewer
  (1-3). Don't require exactly 5 before `result`.
- **`/api/health`** also returns `ofacLoaded` (false = the sanctions override is off).
- **`POST /api/benchmark/run`** needs header `x-admin-token` when the backend runs in prod (403 `forbidden`
  otherwise). The public UI should only *show* benchmark results, not start runs.
- **Identical concurrent checks** (same session, same address and language) are single-flighted: the
  first is charged, the others are served from the cache with `cached: true` and no charge.
- **429 `too_many_open_invoices`** (max 5 unpaid crypto invoices per session).
- **`/api/benchmark` model rows** also carry optional `prAuc` (threshold-free). `illicitF1` / `precision` /
  `recall` are measured at the WARN threshold (predicted illicit = WARN or BLOCK), so a model can have the higher
  `prAuc` and the lower `illicitF1`; show both.
- **Further error codes** (all `{ "error": code }`): 400 `empty_audio`; 422 `audio_unreadable`,
  `audio_conversion_timeout`; 404 `unknown_pack`, `not_found`; 403 `forbidden` (admin routes);
  502 `payments_unavailable` (Dodo call failed; 503 when Dodo is not configured); 503 `service_not_ready`;
  400 `sample_size_above_cap_<N>`, `token_budget_exceeded` (benchmark).

## reportHash canonicalisation

`reportHash = "0x" + hex(keccak256(utf8(canonicalJson(evidence))))` where `canonicalJson` is JSON
with object keys sorted (recursively, by code point), no whitespace (`,` and `:` separators),
non-ASCII characters left as-is (not `\u` escaped). Only strings, integers, booleans and `null`
appear in the evidence (floats are pre-formatted as strings), so `JSON.stringify` on a key-sorted
object produces identical bytes. The evidence object:

```json
{
  "address": "<address>",
  "chain": "bitcoin",
  "dataset": "elliptic++",
  "datasetLabel": "illicit" | "licit" | "unknown" | null,
  "hopsToNearestIllicit": 2 | null,
  "labelHits": {"ofac": false, "ransomwhere": false},
  "model": "<model name>",
  "neighbors": {"hop1": {"illicit": 0, "licit": 0, "unknown": 0}, "hop2": {...}, "hop3": {...} | null},
  "pagerank": "0.00000123" | null,        // 8 decimals, as a string
  "componentSize": 1234 | null,
  "riskScore": 87 | null,
  "verdict": "BLOCK"
}
```

Frontend reference (ethers v6):

```ts
const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(sortKeys(evidence))));
```

Test vectors (from `backend/tests/test_report_hash.py`):

| canonical JSON | keccak256 |
|---|---|
| `{}` | `0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d` |
| `{"a":1,"b":[true,null,"x"]}` | `0x339e8a1d3314cd7f250bf6a7a3cdf2eda788cf4e5314d1ba2b131b4b4d93daad` |
