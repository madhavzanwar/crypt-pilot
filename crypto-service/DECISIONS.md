# Backend decisions log

Every assumption, data finding and deviation from the brief. Newest sections are appended at the
bottom of each heading.

## Environment / process

- **The Elliptic++ CSVs could not be downloaded in the build sandbox.** The data lives on Google
  Drive (blocked by the sandbox network policy) and in the GitHub repo as Git LFS objects (the
  sandbox git proxy does not serve LFS for third-party repos). Consequences:
  - The schema below was verified from the **printed outputs of the dataset's own notebooks**
    (`Actors Dataset/Elliptic++_Actors_Dataset_Statistics.ipynb`), not from the files themselves.
    `scripts/explore_data.py` re-checks it against the real files and fails loudly on mismatch.
  - All code paths were exercised end to end on a **synthetic fixture** (`make fixture`) that
    reproduces the raw CSV format with fake `DEMO-` addresses. Nothing measured on the fixture is
    ever reported as a real metric: processed data and the model card carry
    `source: "synthetic_fixture"`, responses set `isMock: true`, `/api/benchmark` hides fixture
    model metrics.
  - **No real metric, latency or graph count exists yet.** They appear only after the human runs
    `make data && make train` on the real files.
- Python 3.11 target (`requires-python >=3.11`), `uv` for dependency management (`uv.lock` committed).
- `xgboost` (not `xgboost-cpu`): `xgboost-cpu` has no macOS wheels; teammates develop on laptops.
- Schema is created with SQLAlchemy `create_all` at startup (no alembic): tiny, disposable SQLite DB.
- SQLite runs every transaction as `BEGIN IMMEDIATE` (WAL mode). Credit deduction happens in the
  same transaction as the check log row, so two concurrent checks with one credit left serialise and
  exactly one succeeds. Run a single uvicorn worker per SQLite file.
- Rate limits are keyed on client IP, not the session cookie: an anonymous cookie can be dropped to
  reset a per-session limit. Behind a proxy, uvicorn runs with `--proxy-headers`.
- Anonymous sessions are abusable (clear cookies -> 3 new free credits). Accepted for a hackathon
  demo; the per-IP rate limit bounds it. Documented as a limitation.
- Seed-phrase guard uses the real BIP-39 English wordlist (MIT, bitcoin/bips): 12+ consecutive
  BIP-39 words anywhere in a text = secret. The `address` field additionally rejects any 12/15/18/21/24
  lowercase words. Private keys: 64 hex chars (optionally `0x`), WIF-shaped base58 (51 chars starting
  `5`/`9`, 52 starting `K`/`L`/`c`), `xprv`-style extended keys. The error never echoes the input and
  validation errors never echo request bodies.
- Address validation is implemented in-repo (base58check + BIP-173/BIP-350 bech32/bech32m reference
  algorithm) instead of the `bech32` PyPI package, so bech32m (taproot) is handled correctly; tested
  with BIP vectors and well-known addresses.

## Data findings (from the Elliptic++ notebooks; re-verify with `make explore`)

- `wallets_classes.csv`: columns `address, class`; **1 = illicit (14,266), 2 = licit (251,088),
  3 = unknown (557,588)**; 822,942 addresses.
- `wallets_features.csv`: 1,268,260 rows, columns `address`, `Time step` and 55 feature columns
  (the README's "56 features" counts `Time step`). One row per (address, time step) appearance;
  there are exact duplicate rows; within an address the feature values are lifetime aggregates
  (e.g. `first_block_appeared_in`, `last_block_appeared_in`, `num_timesteps_appeared_in` repeat).
  Note the real column name `num_txs_as receiver` contains a space.
- `AddrAddr_edgelist.csv`: columns `input_address, output_address`, 2,868,964 rows, **no time
  column**, directed (input -> output of the same transaction). Contains self-loops (an address
  paying change to itself) and duplicates.
- 49 time steps (about two weeks each).

## Pipeline outputs

- `data/processed/wallets.parquet`: one row per address: `label`, `first_step`, `last_step`,
  `n_appearances` and the 55 features of the address's **latest** appearance (rows are exact
  duplicates per address in the real data, so the choice rarely matters; `latest` is used to be
  deterministic).
- `edges.parquet` (`src`, `dst`): self-loops dropped, duplicates removed, direction kept, edges whose
  endpoint is missing from `wallets_classes.csv` dropped (counts recorded in `manifest.json`).
- `splits.parquet`, `graph_features.parquet`, `manifest.json` (`source` = `elliptic++` or
  `synthetic_fixture`).
- OFAC list: 532 lines on 2026-10-28, 531 pass mainnet checksum validation; the rejected entry is a
  TRON-format address mislisted in the XBT file. Matching is exact on the canonical form.
- Ransomwhere is optional and off by default (CC BY-NC 4.0). OpenSanctions downloads need an
  account/licence acceptance, so the export is downloaded manually to `RANSOMWHERE_PATH` (one
  address per line, or the OpenSanctions CSV with an `address`-like column).

## Raw file layouts (integration)

- Supported: (a) `wallets_classes.csv` + `wallets_features.csv` + edge list (original), or (b) the
  Hugging Face layout without a classes file: classes come from `wallets_features_classes_combined.csv`
  (one class per address; conflicts raise `ConflictingClassesError`). Features come from
  `wallets_features.csv` when present, else from the combined file (class column dropped).
- Only `address`, `Time step` and the 55 known feature columns are read, so unknown extra columns in a
  real file are ignored. Not tested at the real 600 MB size: the combined file is read twice (two
  column subsets) when it is the only source.
- That mirror shows its licence as "unknown", same as the original (no stated licence): the data
  stays git-ignored either way.

## Split design

- **Time-based split on the first time step a wallet appears in**: train = steps 1-28, validation =
  29-34, test = 35-49. Mirrors the usual Elliptic protocol (train 1-34 / test 35-49) with the last six
  training steps held out to tune thresholds and calibration.
- Known leakage risks, documented rather than hidden:
  - Wallet features are lifetime aggregates, so a train wallet's features can include activity
    after step 28. They describe the wallet itself, never another wallet's label.
  - The edge list has no timestamps, so graph structure (degrees, PageRank, components) is computed
    on the full graph (transductive setting, as in the Elliptic++ paper).
  - Neighbour-label features use **train labels only** and exclude the wallet itself (next section).

## Graph features

- Computed offline with scipy sparse matrices (`app/services/datasets/processing.py`) and upserted
  into TigerGraph as vertex attributes (`pagerank`, `comp_id`, `comp_size`, `in_deg`, `out_deg`).
  Reason: the GSQL algorithm library may not be installable on the free tier, and computing once
  offline guarantees the model and TigerGraph use identical numbers.
- PageRank: directed, alpha 0.85, uniform teleport, dangling mass redistributed uniformly.
- Components: weakly connected (undirected view).
- Neighbour-label features: `nb1_illicit_train`, `nb1_licit_train` (distinct hop-1 neighbours),
  `walk2_illicit_train`, `walk2_licit_train` (2-step walks ending at a train-labelled wallet, minus
  walks that return to the wallet itself), `hops_to_illicit_train` in {1, 2, 3 = "3+ or none"}.
  2-step **walk** counts are used instead of distinct hop-2 node counts because distinct counts need
  A·A, which explodes around hubs (max degree is in the tens of thousands). `hops_to_illicit_train`
  is still exact: if no neighbour is a train-illicit wallet but a 2-walk reaches one, it is exactly
  2 hops away.
- The **displayed evidence** (per-hop counts, nearest illicit, subgraph) comes from the graph engine
  and uses the dataset labels of all wallets: that is the dataset's own labelling shown as evidence.
  The **model features** use the precomputed train-label-only features, so served scores match the
  measured test metrics.

## Model

- Two XGBoost models on labelled wallets only (illicit = 1, licit = 0): `baseline` (55 wallet
  features) and `with_graph_features` (+ 9 graph features). `scale_pos_weight` = neg/pos on train.
- Tiny grid (max_depth 4/6 x n_estimators 200/400) picked by **validation** PR-AUC. The serving model
  is the one with the better validation PR-AUC, **never** chosen on test.
- Monotone constraints on `nb1_illicit_train` (+), `walk2_illicit_train` (+), `hops_to_illicit_train`
  (-): more flagged neighbours can never lower the risk. Tested.
- Isotonic calibration fitted on validation; `riskScore = round(100 * p_calibrated)`.
- Thresholds per model chosen on validation: BLOCK = lowest score with precision >= 0.90, WARN =
  lowest score with precision >= 0.50 (below BLOCK), with floors WARN >= 10, BLOCK >= 50 (a calibrated
  probability under 50% never blocks). Calibration and thresholds share the validation split (small
  optimism, documented; the test split is untouched).
- Reported metrics (`model_card.json`, test split, illicit class): precision / recall / F1 where
  "predicted illicit" = score >= WARN (verdict WARN or BLOCK), the same mapping as the benchmark;
  also F1 at the BLOCK threshold, PR-AUC and confusion counts. `graphFeaturesImprovedTestF1` records
  plainly whether graph features helped; nothing is re-tuned after looking at test.
- Metrics measured on the synthetic fixture are never shown (`illicitF1Test: null`, `/api/benchmark`
  omits them); only `dataSource: "elliptic++"` cards surface numbers.
- Policy: an OFAC hit forces BLOCK, **including for addresses outside the dataset**. Such a response
  keeps `status: "not_in_dataset"`, `riskScore: null`, `labelHits.ofac: true` and is not charged.
- Demo wallets come only from the test split. `expected` is the verdict the trained system actually
  gives; wallets are picked where it agrees with the dataset label so the demo is predictable (a demo
  choice, not a metric).
- `model.joblib` is a local trusted artifact produced by `scripts/train.py`; never load one from an
  untrusted source (pickle).

## Check pipeline

- Order: secret guard -> checksum -> credit gate (402 if balance is 0, as the brief orders it, even
  for a request that would have been a free cache hit) -> cache -> engine -> score -> verdict ->
  reasons -> explanation -> persist + charge -> respond.
- Charging: only `status: "ok"` responses that are not cache hits, deducted in the same
  `BEGIN IMMEDIATE` transaction as the `check_log` row, after the response exists. If the last
  credit was spent by a concurrent request meanwhile, the request gets 402 (SSE: `event: error`
  `{error: "no_credits", status: 402}`). The persist step is shielded from client cancellation.
- Replays (`DEMO_REPLAY=true` or engine failure with `REPLAY_FALLBACK=true`) are recorded real
  responses for an in-dataset wallet with `status: "ok"`, so they are charged like a live answer.
  They are always labelled (`engine: "replay"`, `replay: true`, a limitation line with the
  recording time).
- Engine failure without a replay -> HTTP 503 with a `CheckResponse` (`status: "error"`,
  `error: "graph_unavailable"`), never charged. The body has an `error` key, so it also matches the
  generic `{error}` shape.
- Not found in the graph: `tigergraph.queryName` is `<engine>.lookup` and `ms` is the existence
  lookup time (no k-hop query ran).
- Wire format: required-but-nullable fields (`riskScore`, `datasetLabel`, `hopsToNearestIllicit`)
  are always present; unset optional fields are omitted (`to_wire`).
- Cache: in-process TTL cache keyed by address + lang (single worker). The cached body excludes
  `creditsRemaining`; a hit returns `cached: true` with the current balance.
- On the synthetic fixture every text says "synthetic fixture" instead of "Elliptic++" and
  `isMock: true` is set.

## Explanations

- `LLM_PROVIDER` anthropic | openai | openai_compatible over plain httpx (no SDK); timeout
  `LLM_TIMEOUT_S`, 2 attempts on 429/5xx/transport errors; usage = the provider's reported tokens.
- The LLM sees only a whitelisted slice of the evidence JSON (verdict, score, label, counts, hops,
  list hits, component size, deterministic reasons). The address is checksum-validated and the
  language is an enum, so no user free text reaches the prompt.
- One call returns `{"en", "hi"}`. Each language is validated separately: every number must appear in
  the evidence (constants allowed: 100 and hop indices 0..maxHop; Devanagari digits normalised),
  verdict words must match, OFAC/ransomware/illicit mentions must be backed by evidence, banned
  phrases (guilty, criminal, scam..., safe wallet, guaranteed..., police/lawyer, owned by...) are
  rejected, and the limitation sentence must be present (appended if missing, then validated).
  One retry, then the deterministic template for any language that still fails. The path taken is
  logged (`explain_path`), not returned.
- The templates themselves are tested to pass the validator for every verdict type.
- No LLM configured -> templates only (`/api/health` `llmConfigured: false`).

## Voice

- STT order: Wispr Flow (if `WISPR_API_KEY`) -> Sarvam (if `SARVAM_API_KEY` and `SARVAM_STT_MODEL`)
  -> HTTP 503 `voice_unavailable` (the frontend falls back to browser speech recognition). The
  `provider` field is whoever actually produced the text.
- Sarvam request/response shapes verified against the official `sarvamai` 0.1.40 SDK source
  (STT: multipart `file`, `model`, `language_code` -> `transcript`; TTS: JSON `text`,
  `language_code`, `model`, `speaker`, `output_audio_codec` -> `audios[0]` base64; header
  `api-subscription-key`). Model names stay in env (`SARVAM_STT_MODEL`, e.g. `saaras:v3`;
  `SARVAM_TTS_MODEL`, e.g. `bulbul:v3`).
- **Wispr Flow request shape is unverified** (docs unreachable from the build sandbox): implemented
  from the brief (`POST /api/v1/dash/api`, Bearer key, JSON `{audio: base64 16 kHz WAV, language,
  context}`; the transcript is read from `text` or `transcript`). Any error falls through to Sarvam.
  Hindi support on Wispr is unverified.
- Audio: content type allow-list plus magic-byte check, max 5 MB, converted with ffmpeg (subprocess,
  15 s timeout) to 16 kHz mono WAV, max 30 s.
- A transcript that looks like a seed phrase or private key is dropped (400 `secret_input`), never
  returned or logged.
- Address extraction tries the raw text, the text without separators, then spoken forms ("capital
  A", "small b", number words in English and Hindi). Every candidate must pass the checksum; else
  `address: null` and the frontend asks the user to confirm or edit `text`.
- TTS is optional: mp3 cached by content hash under `artifacts/audio/`, files older than 24 h are
  deleted, served at `/api/audio/{hash}.mp3`. Without Sarvam TTS, `audioUrl` is omitted and the
  frontend uses browser speech synthesis.

## Credits and payments

- Ledger: append-only `credit_ledger`, balance = SUM(delta). `(reason, ref)` is UNIQUE, so a
  starting grant (ref = session), a Dodo payment (ref = payment_id) or a crypto invoice
  (ref = invoice id) can only ever be credited once, even if different webhook events repeat it.
- Dodo: plain httpx against the endpoints of the official `dodopayments` SDK 1.124.0
  (`POST https://test.dodopayments.com/checkouts` with `product_cart`, `metadata`, `return_url` ->
  `checkout_url`). `DODO_ENV` only accepts `test_mode`. Cancel URL: the checkout API takes a single
  `return_url` (success and failure), so it points to `/credits/success`; the frontend checks the
  balance there (a `/credits/cancelled` page cannot be targeted by this API).
- Webhooks: Standard Webhooks HMAC implemented in `webhook_verify.py` (5-minute tolerance,
  constant-time compare, multiple signatures supported), unit-tested against a vector produced by the
  official `standardwebhooks` library. The event id (`webhook-id`) is stored in `webhook_events` in
  the same transaction as the credit, and duplicates return 200 immediately.
- Usage reporting: after a charged check, a fire-and-forget task posts a usage event
  (`/events/ingest`, `event_id` as idempotency key), only when `DODO_USAGE_METER_EVENT` is set and the
  session has a Dodo `customer_id` (learned from its payment webhook). Anonymous sessions that never
  paid through Dodo have no customer to meter. Failures are logged and never affect the check.
- Crypto (testnet/signet only): BTC invoices need `BTC_RECEIVE_ADDRESS` (must validate as a testnet
  address), `BTC_SATS_PER_USD` (testnet coins have no price; this is a demo conversion) and
  `BTC_EXPLORER_BASE_URL` (Esplora API, e.g. `https://mempool.space/testnet4/api` or
  `https://mempool.space/signet/api`; **liveness not verified from the build sandbox**). Amount = price
  x rate + a unique 1..999 sats; a clash with an open invoice returns 409 `try_again`. Explorer polling
  happens at most every 10 s per invoice. Payments older than the invoice (minus 5 minutes) are
  ignored. Required confirmations: `BTC_CONFIRMATIONS` (0 or 1 for demos).
- Monero: `monero:` URI only, `provider: "demo"`, 0.01 XMR per credit (demo amount, not a price). No
  automatic confirmation; `POST /api/admin/crypto-invoice/{id}/mark-paid` with header
  `x-admin-token: $ADMIN_TOKEN` (disabled while the token is empty or `change_me`; not exposed via CORS).
- Invoices are only visible to the session that created them (others get 404).
- The app never sees private keys: receive addresses are public, wallets stay with their owners.

## Benchmark

- Sample: N (cap 50, default 25) labelled wallets from the **test split**, stratified half illicit /
  half licit (as far as available), fixed seed 1234 (recorded in the results file).
- Same LLM, same instructions, two inputs: `raw_dump` (55 raw feature values + up to 300 raw 1-2 hop
  edges with each endpoint's dataset label) vs `graph_evidence` (compact JSON from the graph engine:
  per-hop label counts, hops to nearest illicit, PageRank, component size, degrees). **Both hide the
  wallet's own label, the model score and the verdict**, otherwise the LLM would copy the answer.
- Correctness mapping: predicted illicit = WARN or BLOCK, predicted licit = ALLOW, truth = dataset
  label. Aggregates: mean provider-reported input tokens, median end-to-end latency (input building,
  including the graph query, plus the LLM call), accuracy %. Unparseable answers count as wrong and
  are reported (`unparseable`).
- Cost guard: refuse above the sample cap; estimate tokens (chars/4, used only for the guard, never
  reported) for both methods before any LLM call and refuse above `BENCHMARK_MAX_TOKENS`; one job at a
  time (409); `POST /api/benchmark/run` is rate-limited to 3/hour per IP.
- `GET /api/benchmark` returns numbers only from files whose `dataSource` is `elliptic++`; fixture
  results and fixture model cards are never shown (`not_measured`). If the model card is real but
  the benchmark has not run, it returns `status: "ok"` with `rows: []`, `sampleSize: 0`, the `models`
  table, and `measuredAt` = the model training time.

## TigerGraph

- pyTigerGraph **2.0.5** (installed version; connection args read from its source):
  `TigerGraphConnection(host, graphname, gsqlSecret=...)` then `getToken(secret)` for Savanna/Cloud,
  or `username`/`password`. pyTigerGraph sets **no HTTP timeout** unless a `GSQL-TIMEOUT` header is
  set, so the engine sets the header (server-side abort) **and** enforces a client-side deadline
  (`TG_QUERY_TIMEOUT_S`, default 8 s) by running each call in a worker thread.
- Schema (`app/services/graph/gsql/schema.gsql`): `Wallet(PRIMARY_ID address, label, pagerank,
  comp_id, comp_size, in_deg, out_deg)`, directed `SENT_TO`, graph `Cryptiq`. The 55 wallet
  feature columns stay in Parquet (keeps the load small).
- Queries: `khop_exposure` (undirected BFS with a per-hop frontier `LIMIT` hub guard, per-hop label
  counts, nearest illicit hop, capped subgraph ordered by hop then illicit/unknown/licit, edges
  among the capped nodes in their original direction), `wallet_summary`, `graph_stats` (verification).
  **The GSQL was written from the GSQL v2 documentation but could not be compiled in the build
  sandbox (no cluster).** `make install-queries` will report any syntax error; the parser of the
  query output is unit-tested against the documented JSON shape.
- Graph features (PageRank, WCC) are computed offline (see "Graph features") and upserted as
  attributes; the GSQL algorithm library is not required.
- **Free-tier limits: not verified** (no account available in the build sandbox). The full graph is
  ~823k vertices / ~2.87M edges with 7 small attributes. If the cluster refuses it, run
  `make load-graph ARGS="--subset labelled-2hop"` (wallets within 2 hops of any labelled wallet) and
  record the exact counts from `artifacts/tg_load_summary.json` here; responses then carry a
  limitation line about the subset.
- Hub safety: per-hop frontier cap `MAX_FRONTIER` (5000) and the query timeout. On truncation the
  response sets `truncated: true` and adds a limitation line.

## Hardening

- Middleware order (outer -> inner): streaming body limit + security headers (pure ASGI; also stops
  chunked uploads with no Content-Length, 413) -> CORS (explicit allow-list, credentials, never `*`)
  -> request id / session cookie / unhandled-error guard -> slowapi rate limits (30/min check,
  10/min transcribe, 3/hour benchmark run; per IP).
- Unhandled exceptions are turned into `500 {"error": "internal_error"}` **inside** the app. Found
  during the smoke test: letting them reach uvicorn (Starlette's default re-raise) closed keep-alive
  connections, so the client's next request failed with "connection reset". Covered by a test.
- `APP_ENV=prod` refuses to start with placeholder `SESSION_SECRET` / `LOG_SALT`, `SameSite=None`
  without `Secure`, or an empty CORS list. `DEMO_MODE` in prod only logs a warning (a fixture-only
  demo deploy is labelled `isMock` anyway). OpenAPI docs UI is disabled in prod.
- Additive SQLite migration at startup: missing **nullable** columns are added with
  `ALTER TABLE ADD COLUMN` (found when an older local database lacked `sessions.dodo_customer_id`).
- Every outbound call has a timeout: TigerGraph (client deadline + GSQL-TIMEOUT), LLM
  (`LLM_TIMEOUT_S`), Sarvam/Wispr (`VOICE_TIMEOUT_S`), Dodo (10 s), explorer (8 s), ffmpeg (15 s).
- Logs never contain full addresses (salted HMAC), request bodies, transcripts or secrets.
  Validation errors list field names only.
- `pip-audit` (2026-10-28): no known vulnerabilities in the locked dependencies.
- `.dockerignore` keeps `.env*`, `data/`, `artifacts/` and tests out of the image.
- The Dockerfile was **not built** in the sandbox (no Docker daemon); build it locally before deploying.

## Measured numbers (only what was actually measured)

- On the **synthetic fixture** (2,400 fake wallets, NetworkX engine, template explanations, no LLM,
  cache disabled, local machine): `scripts/smoke.py --runs 10` measured `/api/check` median 22 ms,
  p95 28 ms over 80 requests. **Not representative** of TigerGraph + LLM on the real graph; re-run
  `make smoke` against the real deployment and record the result here.
- Model metrics, graph counts and benchmark results on Elliptic++: **not measured yet** (the data
  could not be downloaded in the build sandbox).

## Deployment

- Host: Fly.io (Docker, volume for `data/` + `artifacts/`, automatic HTTPS, no auto-stop so the demo
  has no cold start). 1 GB machine because the scorer's feature table for 823k wallets is
  ~210 MB in float32. See `DEPLOY.md`.

## Adversarial review of the merged backend (integration)

An independent read-only reviewer examined the merged code. Fixed (each has a regression test in
`tests/test_review_fixes.py`):

1. **Double charge on concurrent identical checks** (verified by experiment: 3 identical concurrent
   checks charged 3 credits). Now single-flight per address+lang: the first is charged, the rest wait
   and are served from the cache uncharged.
2. Benchmark run endpoint: admin token required in prod; heavy scans moved off the event loop; the
   job slot is claimed atomically; stale "running" jobs are failed at startup (otherwise 409 forever);
   cancellation no longer records "done"; a row without provider-reported tokens is omitted, never 0.
3. Verdict floor: a wallet the dataset itself labels illicit is never ALLOW (floored at WARN), so the
   verdict can't contradict the label shown beside it. Model-card metrics describe the model alone,
   without this floor.
4. OFAC list: surfaced as `ofacLoaded` in `/api/health`; prod refuses to start without it.
5. LLM explanations have an overall 8 s deadline, then the template (was up to ~25 s).
6. Secret guard: zero-width characters, full-width letters and "1. word 2. word" numbering no longer
   bypass it.
7. Unauthenticated 500s: a Unicode-digit webhook timestamp and a non-ASCII admin token now give 401/403.
8. Crypto: a tx can't credit two invoices; stale invoices release their amount; max 5 open invoices
   per session; an empty Ransomwhere file no longer crashes start-up.
9. Replays are only charged when `status == "ok"`.
10. Rate limiting no longer trusts `X-Forwarded-For`; behind Fly it keys on `Fly-Client-IP`
    (`TRUST_FLY_CLIENT_IP=true`).
11. Fly: memory raised to 2 GB (measured peak ~1.04 GB just for the feature table; the earlier
    "300-400 MB" claim in DEPLOY.md was wrong) and cookies switched to `SameSite=Lax` with a
    same-origin proxy (cross-site `SameSite=None` loses sessions, and payments, in Safari/Chrome).
12. `/api/demo-wallets` returns nothing if the file was exported for a different dataset than the
    loaded model. Limitation text names the actual dataset.
13. GSQL `khop_exposure` revised: two plain directed hops (`-(SENT_TO>)-`, `-(<SENT_TO)-`) instead of
    `-(SENT_TO>|<SENT_TO)-`, and the frontier cap is applied before vertices are marked visited.
    **Still never compiled on a real cluster.** `address` removed from the vertex upsert attribute
    mapping (it is the primary id).

Found but NOT fixed (known issues, in rough priority):

- **Hub cost in TigerGraph:** the frontier cap limits what is kept, not the edges scanned; a very high
  degree wallet may hit the 8 s timeout and take the `graph_unavailable` path (replay or 503).
- The TigerGraph subgraph (`Capped`) has no ancestor closure like the NetworkX engine, so a shown node
  can lack a path to the subject in the picture.
- `TigerGraphEngine._token_ok` never refreshes (calls fail after the token expires); `elapsed_ms`
  includes the existence lookup (two round trips) and the worst case is about 16 s.
- A wallet in the dataset but outside a documented TigerGraph *subset* is reported "not in the research
  dataset".
- Free credits are per cookie (3 per new cookie); the per-IP rate limit is the only brake.
- If `DODO_USAGE_METER_EVENT` is set while packs are prepaid, customers would be billed twice: leave it unset.
- `ffmpeg -f wav pipe:1` writes unseekable size fields; a strict STT parser may reject it.
- NetworkX engine: ~2.5 GB+ memory on the full graph, and a hub's neighbours are re-sorted on every visit.
- The feature table loader's peak memory was not optimised (only the VM size was raised).

## Contract additions

See `docs/api-contract.md` -> "Backend additions".
