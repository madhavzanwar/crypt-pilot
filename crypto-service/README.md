# Cryptiq backend

FastAPI service that turns a Bitcoin address into a risk signal (ALLOW / WARN / BLOCK / UNKNOWN)
from the Elliptic++ research graph. It is a **risk signal, not an accusation**, and the data is a
**research dataset, not the live blockchain**.

See `DECISIONS.md` for every assumption and data finding, `../docs/api-contract.md` for the API and
`DEPLOY.md` for deployment.

## Architecture

```
Browser (Next.js, /frontend)
   | HTTPS, cookie session `cryptiq_sid` (credentials: include)
   v
FastAPI (/backend/app) --------------------------------------------------------------
 middleware: body limit + security headers -> CORS -> request id / session / 500 guard -> rate limit
 routers: health  demo  check(+SSE)  transcribe  audio  credits/checkout  crypto  webhooks  benchmark
 services:
   address.py        checksums (base58check, bech32/bech32m) + seed-phrase / private-key guard
   pipeline.py       validate -> credit gate -> cache -> graph -> score -> verdict -> reasons
                     -> explanation -> (TTS) -> atomic persist + charge
   graph/            TigerGraphEngine (primary) | NetworkXEngine (fallback) | ReplayStore (demo safety)
   model/            feature table, XGBoost scorer + isotonic calibration, verdict policy, EN/HI reasons
   labels/           OFAC (and optional Ransomwhere) exact-match lists
   explain/          LLM client (anthropic/openai/compatible) -> groundedness validator -> templates
   voice/            ffmpeg -> Wispr | Sarvam STT, address extraction, Sarvam TTS
   billing/          append-only ledger, Dodo test checkout + Standard Webhooks, BTC/XMR invoices
   bench/            raw_dump vs graph_evidence benchmark
 SQLite (SQLAlchemy 2): sessions, credit_ledger, invoices, webhook_events, check_log, benchmark_jobs
   |                         |                                  |
   v                         v                                  v
TigerGraph Savanna     data/processed/*.parquet           LLM / Sarvam / Wispr / Dodo test /
(pyTigerGraph)         artifacts/ (model, card,           Esplora testnet explorer
                       demo wallets, replays)  [git-ignored]
```

## Quick start (local)

```bash
cd backend
make setup                 # uv sync
cp .env.example .env       # then fill values
make run                   # http://localhost:8000/api/health , docs at /api/docs
make test lint
```

## Data pipeline

The Elliptic++ files are **not** in git (no stated licence). Download them yourself from the
Google Drive folder linked in https://github.com/git-disl/EllipticPlusPlus (folder "Actors Dataset")
and put these three files in `backend/data/raw/`:

```
data/raw/wallets_features.csv
data/raw/wallets_classes.csv
data/raw/AddrAddr_edgelist.csv
```

| Command | What it does |
|---|---|
| `make download` | `SRC=hf` (default) or `SRC=gdrive`: fetch the files into `data/raw/` and verify they are real (not Git-LFS pointers; sizes; row counts against the published 822,942 wallets / 1,268,260 feature rows / 2,868,964 edges). `make verify-data` re-checks without downloading. Needs the optional `data` group (`uv sync --group data`) |
| `make explore` | checks the schema and writes `artifacts/data_summary.json` (columns, label encoding, duplicates, self-loops, degree stats) |
| `make data` | `explore` + builds `data/processed/*.parquet` (wallets, edges, time-based splits, graph features) + downloads the OFAC list |
| `make fixture` | builds a **synthetic** fake dataset with `DEMO-` addresses under `data/fixture/` for offline work (set `DATA_DIR=./data/fixture`, `DEMO_MODE=true`) |

**Hugging Face mirror layout.** The mirror https://huggingface.co/datasets/AI4FinTech/ellipticpp has no
`wallets_classes.csv`. The pipeline then reads labels from `wallets_features_classes_combined.csv`
(plus `AddrAddr_edgelist.csv`, and `wallets_features.csv` if present). An address with conflicting
classes across rows is an error (never guessed). Git-LFS pointer files (tiny text files starting with
`version https://git-lfs`) are detected and reported instead of failing in the CSV parser.
`python -m scripts.make_fixture --layout combined` builds a synthetic fixture in this layout.

All scripts are idempotent (re-running overwrites outputs).

## Graph engines

| `GRAPH_ENGINE` | Use |
|---|---|
| `tigergraph` | primary. Needs `TG_HOST`, `TG_GRAPH`, `TG_SECRET` (or `TG_USERNAME`/`TG_PASSWORD`) |
| `networkx` | in-memory graph from `data/processed` (tests, offline dev, labelled fallback; ~2 GB RAM for the full graph) |

Responses always say which engine answered (`engine`). Replay (pre-recorded real responses for the
demo wallets) is a separate safety net; see "Demo safety".

### Loading TigerGraph (Savanna free tier)

1. Create a free workspace at https://tgcloud.io , create a database, then create a GSQL secret
   (Admin -> Users / Secrets, or `CREATE SECRET` in the GSQL shell). Put the host and secret in `.env`.
2. `make data` (processed Parquet must exist), then:

```bash
make load-graph        # creates the schema if missing, upserts in 50k chunks, resumable
make install-queries   # khop_exposure, wallet_summary, graph_stats
make verify-graph      # counts per label vs Parquet; exits 1 on mismatch
make test-tg           # NetworkX vs TigerGraph parity on 5 random wallets
```

## Model

```bash
make train     # trains baseline + graph models, writes artifacts/model.joblib, model_card.json, demo_wallets.json
```

`artifacts/model_card.json` holds every reported number (test split, illicit class), the split, the
feature lists, thresholds (chosen on validation), library versions and dataset counts. Nothing in the
API hard-codes a metric.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `ok`, `voiceProvider`, `mocks`, engine/model/LLM diagnostics |
| GET | `/api/demo-wallets` | held-out test-split wallets with the verdict the system gives |
| POST | `/api/check` | `{address, lang}` -> `CheckResponse`; 400 invalid/secret, 402 no credits |
| POST | `/api/check/stream` | same, as SSE (`step` x5 then `result`) |
| POST | `/api/transcribe` | multipart `audio` + `lang` -> `{text, address, provider}`; 503 = use browser STT |
| GET | `/api/audio/{hash}.mp3` | TTS audio (only if Sarvam TTS is configured) |
| GET | `/api/credits` | balance + packs |
| POST | `/api/checkout` | Dodo test checkout URL |
| POST/GET | `/api/crypto-invoice`, `/api/crypto-invoice/{id}` | BTC testnet / XMR demo invoices |
| POST | `/api/webhooks/dodo` | Dodo webhook (signature verified, idempotent) |
| GET/POST | `/api/benchmark`, `/api/benchmark/run`, `/api/benchmark/job/{id}` | measured benchmark |

## API

Full contract: `../docs/api-contract.md` (OpenAPI: `../docs/openapi.json`, live docs at `/api/docs`).
Use a cookie jar so the session (and credits) persist:

```bash
curl -s localhost:8000/api/health
curl -s localhost:8000/api/demo-wallets
curl -s -c jar -b jar -X POST localhost:8000/api/check -H 'content-type: application/json' \
  -d '{"address":"<address from demo-wallets>","lang":"en"}'
curl -N -c jar -b jar -X POST localhost:8000/api/check/stream -H 'content-type: application/json' \
  -d '{"address":"<address>","lang":"hi"}'
```

### Run on the synthetic fixture (no real data needed)

```bash
make fixture        # fake DEMO- wallets, processed data, trained model, demo wallets
make run-fixture    # API on http://localhost:8000 with GRAPH_ENGINE=networkx, DEMO_MODE=true
```

Responses then carry `isMock: true` and "synthetic fixture" wording; never show them as real results.

### Demo safety

`make record-replays` stores REAL responses for the demo wallets (from the live engine) in
`artifacts/replay/`. `DEMO_REPLAY=true` serves them directly; `REPLAY_FALLBACK=true` (default) serves
them only when the graph engine fails. Replays are always labelled `engine: "replay"`, `replay: true`.

## Payments (test mode only)

- **Dodo:** set `DODO_API_KEY` (test key), `DODO_WEBHOOK_SECRET`, and `PACKS_JSON` with your test
  product ids. Webhook URL: `https://<backend>/api/webhooks/dodo` (subscribe to `payment.succeeded`).
  Local testing: expose port 8000 with a tunnel, or use the Dodo CLI's webhook listener if available.
- **Bitcoin testnet / signet (Cake Wallet):** set `BTC_NETWORK`, `BTC_RECEIVE_ADDRESS` (a testnet
  address from your own wallet), `BTC_SATS_PER_USD`, `BTC_EXPLORER_BASE_URL`, `BTC_CONFIRMATIONS`.
  The invoice URI (`bitcoin:...?amount=`) can be shown as a QR code for Cake Wallet.
- **Monero (demo):** `XMR_DEMO_ADDRESS`; confirm manually:

```bash
curl -X POST https://<backend>/api/admin/crypto-invoice/<invoiceId>/mark-paid -H "x-admin-token: $ADMIN_TOKEN"
```

## Benchmark

```bash
make benchmark        # needs LLM_* env and a trained model; writes artifacts/benchmark_results.json
```

Or `POST /api/benchmark/run {"sampleSize": 25}` then poll `GET /api/benchmark/job/{jobId}`.
`GET /api/benchmark` stays `not_measured` until real (Elliptic++) results exist.

## Tests, lint, smoke

```bash
make test           # unit + end-to-end tests on a synthetic graph (TigerGraph tests skipped without creds)
make test-tg        # live TigerGraph parity tests (needs TG_* env and a loaded graph)
make lint           # ruff + mypy --strict
make audit          # pip-audit
make smoke          # hits every endpoint of a running server, prints PASS/FAIL and measured latency
```

The smoke test checks every demo wallet and then times repeated checks, so start the **server** with
enough credits and a higher per-IP limit, e.g.:

```bash
STARTING_CREDITS=100 RATE_LIMIT_CHECK=1000/minute make run-fixture   # terminal 1
make smoke                                                           # terminal 2
```

## Running with real data (the full path)

```bash
make setup && cp .env.example .env            # fill TG_*, LLM_*, SARVAM_*, DODO_* ...
# put the three Elliptic++ CSVs in data/raw/ (see "Data pipeline")
make data train                               # processed parquet, model card, demo wallets
make load-graph install-queries verify-graph  # TigerGraph
make record-replays                           # real responses for the demo wallets (safety net)
make run
```
