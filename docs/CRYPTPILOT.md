# CryptPilot: FinPilot x Cryptiq

CryptPilot is two projects in one repository. **FinPilot** is a personal-finance AI copilot (Next.js frontend, FastAPI backend, 90-day Monte Carlo cash-flow forecasts, an Evidence Council and a Risk Council of specialist agents). **Cryptiq** is a Bitcoin wallet risk checker: paste an address, get ALLOW / WARN / BLOCK / UNKNOWN, with graph evidence and a plain-language explanation in English and Hindi.

This file says what the merge added, what it removed, what has actually been verified, and what is still open. The `cryptiq-merge` branch has been merged; this file describes the code now in the repository. For how the pieces connect, see [CRYPTPILOT_ARCHITECTURE.md](CRYPTPILOT_ARCHITECTURE.md). FinPilot's own docs (root `README.md`, `ENVIRONMENT.md`, `docs/FinPilot_Feature_Guide.*`) are unchanged and still describe the baseline product. In particular `docs/FinPilot_Feature_Guide.*` still documents the Google Pay link and the FinPilot Pay phone app (`/pay`), which this repository has removed from the UI; read it as history, not as the current feature list.

## Why merge them

A person who manages money in one place also sends money to wallets they do not know. FinPilot knows the user's finances; Cryptiq knows whether a wallet is connected to addresses labelled illicit in a research graph. Putting them together means the wallet check can happen where the payment decision is made (the Copilot chat, the Evidence Room, the Risk Council, the fraud simulator), and the credits that pay for checks can be bought with a card (Dodo test mode) or a Bitcoin testnet / Monero demo invoice (Cake Wallet).

Everything payment-related is **test mode or testnet only**. No real money moves. Mainnet is not configured anywhere in the frontend (Base Sepolia only) or the credit rails (Dodo `test_mode` only; the service refuses any other value).

## What was added

| Feature | What it is | Where |
|---|---|---|
| **Wallet Guard** | `/wallet-guard`: check a Bitcoin address, get a verdict card, progress steps, an inspectable evidence graph, and an explanation in English or Hindi. Demo-wallet chips, `?address=` deep link, seed-phrase guard. A Wallet Guard tile on the dashboard jumps to it. | `frontend/components/crypto/guard/`, `frontend/components/crypto/graph/`, `frontend/lib/crypto/` |
| **Credits** | `/credits` and a credits drawer. 1 credit per new check; a repeat of the same wallet within 10 minutes is served from cache and costs nothing; UNKNOWN is free; a service error is free. Packs are bought through Dodo Payments test-mode checkout or a Cake Wallet invoice. | `frontend/components/crypto/credits/`, `crypto-service/app/services/billing/` |
| **Cake Wallet invoices** | In Connectors, **Dodo Payments** and **Cake Wallet** appear as always-available "payment rails" (they carry no user data). A Bitcoin testnet invoice is a `bitcoin:` URI plus QR; Monero is a `monero:` URI plus QR in demo mode. BTC payment is detected by polling an Esplora-style explorer; **XMR has no automatic confirmation** (demo only). | `backend/app/api/connectors_router.py`, `frontend/components/crypto/credits/CryptoInvoice.tsx`, `crypto-service/app/services/billing/crypto.py` |
| **Voice in the Copilot** | A mic button in the Copilot input. Audio goes to `POST /api/crypto/transcribe`; the text lands in the input box for the person to check and edit (it is never sent automatically). A chip shows which provider actually produced it: "Wispr Flow", "Sarvam" or "Browser speech". If the service has no voice provider, the browser's Web Speech API is used. Seed phrases and private keys are detected and cleared, never sent. A wallet address in a chat message shows a wallet verdict card under it. | `frontend/components/crypto/voice/`, `frontend/lib/crypto/voice/`, `frontend/app/(app)/copilot/page.tsx`, `crypto-service/app/services/voice/` |
| **Chain Analyst** | A council specialist that screens up to five public wallet addresses the user lists. In the **Evidence Room** it is a tenth stage just before the Risk Scorer; in the **Risk Council** it is an eighth specialist that reports graph evidence (no model, no tokens) and **abstains** when a wallet is UNKNOWN or the service is offline. Informational findings (ALLOW, not in dataset) never raise the risk score. The fraud simulator in the Twin page also accepts an optional wallet. With no wallets listed, the original nine agents and seven-agent council behave exactly as before. | `backend/app/security/chain_analyst.py`, `backend/app/security/council.py`, `backend/app/security/agents.py`, `frontend/components/crypto/council/` |
| **Statement anchoring** | On `/statement` (screen only, hidden when printing) an "Anchor this statement on-chain" panel offers an EAS attestation on **Base Sepolia** (testnet), plus a "Verify a statement hash" field that needs no wallet. Only hashes, the document type, the period and the health score are published. A **simulated** preview of the steps exists for when no schema UID is configured. | `frontend/components/statement/StatementAnchorPanel.tsx`, `frontend/lib/crypto/eas/`, `frontend/components/crypto/web3/` |
| **AI x crypto landing** | New page title and metadata ("CryptPilot"), a hero with a "Check a wallet" action, a Wallet Guard section with an illustrative (not real) example verdict, a "Crypto" navigation group (Wallet Guard, Credits) and a mobile "Guard" tab (in the code; the audit found the mobile bottom navigation was never rendered). | `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/components/AppSidebar.tsx`, `frontend/components/MobileBottomNav.tsx` |
| **Crypto bridge** | The browser only talks to the FinPilot API at `/api/crypto/*`. An explicit allowlist of routes is forwarded to the crypto service; only the crypto session cookie (`cryptiq_sid`) crosses over, never FinPilot credentials. `GET /api/crypto/status` is answered by FinPilot itself and reports which voice provider the service has. | `backend/app/crypto_bridge/` |
| **crypto-service** | The Cryptiq backend, vendored as its own FastAPI service: scoring model, TigerGraph and NetworkX graph engines, OFAC list, LLM explanations with a groundedness validator and template fallback, Sarvam / Wispr voice, Dodo and BTC/XMR billing, and a raw-dump vs graph-evidence benchmark. | `crypto-service/` (its API contract is `docs/crypto-service-api-contract.md`) |

## What was removed or trimmed, and why

The merge narrows FinPilot to the surfaces that support the "AI x crypto" story and makes room for the Crypto navigation group. Removed items are frontend pages and components on this branch; the corresponding FinPilot backend routes were **not** deleted by this diff.

| Removed or trimmed | Detail |
|---|---|
| **Photo prices** navigation entry | The nav link is gone. The `/photos` page itself is **kept**: the voice assistant routes to it for spoken quick-add of an expense ("item + amount"), and it is described to the model as "not in the menu". |
| **Invoices** | `/invoices` page removed (nav entry and the voice page route too). |
| **Scheme Analyst**, **Web Intel**, the **Schemes** nav group | Pages removed; the group is gone from the sidebar. |
| **Agent Ops** | `/agent-ops` page removed. |
| **Google Pay / FinPilot Pay phone card** | The Google Pay connector, its link dialog and mark, and the dashboard "Phone payments" card are removed. In Connectors, Google Pay is replaced by the Dodo and Cake Wallet payment rails. The backend still accepts the `google_pay` id (`LEGACY_IDS`) because the Account Aggregator flow and plan seeding record that link. The `PhonePairPanel` component still sits in `components/dashboard/PhonePairCard.tsx` but nothing renders it any more. |
| Mobile "Goals" tab | Replaced by "Guard" in the bottom nav (Goals is still in the sidebar). |

The reasons given here are the product reasons for the merge (a focused demo and a Connectors page whose payment options are the ones CryptPilot actually supports). They are not recorded in the code, so treat them as the maintainers' intent.

## Honest status

Three kinds of statement are kept apart, so nothing here is claimed beyond what was seen:

- **Measured in this repository** (re-run during the 2026-10-29 audit and round-2 fixes, at the base commit `d010b1a`): the test and type-check numbers below.
- **Reported by an earlier session, not re-run here**: results from the Cryptiq project's own runs (TigerGraph, benchmark, data download, browser pass). They may be true, but the evidence lives outside this repository and was not reproduced.
- **Never run**: anything needing a key, a wallet, an account or coins.

| Area | Status | Evidence / what is missing |
|---|---|---|
| crypto-service tests | **Measured by the round-2 baseline run** | `crypto-service`: 219 passed, 3 skipped at `d010b1a` (unit level; the services are mocked or local; not a live end-to-end result). Not re-run by the author of this table: a re-run on a busy machine did not finish in time. |
| FinPilot backend tests | **Measured, 4 failing** | `cd backend && FINPILOT_DEMO_MODE=true python -m pytest --noconftest tests`: 508 passed, 4 failed (`test_household::test_managed_member_lifecycle`, `test_plan::test_demo_personas_get_seeded_plan_profiles`, `test_rag::test_retrieve_dining_first`, `test_seed_realism[demo-arjun]`). The same tests failed on the untouched FinPilot code; the plan test depends on today's date. |
| Frontend type-check | **Measured** | `npx next typegen && npx tsc --noEmit` in `frontend/`: 0 errors. Without `next typegen` (or a `next build`) a clean checkout reports one error, `LayoutProps` in `app/layout.tsx`, because Next generates that type. `next build` passes (35 routes, per the audit). |
| Statement audit hash | **Measured** | `node frontend/scripts/check-statement-hash.mjs`: 314 inputs, 0 mismatches between the browser implementation and Node's `crypto`. It fingerprints the printed figures; it is not a signature. The anchored period was hard-coded to "2026-09" at audit time (BUG-040). |
| Graph engine used in the 2026-10-29 audit | **NetworkX** | TigerGraph Savanna was suspended (`GET /restpp/echo` returned 500 "Failed to start workspace"), so every audit check ran on the NetworkX engine over the same data. Only the Savanna owner can resume the workspace. |
| TigerGraph Savanna engine | **Reported, not re-run here** | An earlier Cryptiq session reported matching vertex/edge counts, 0 differences against NetworkX over 46 wallets and p50/p95 latencies. Those numbers are not reproduced here and are deliberately not repeated; the workspace was unreachable on 2026-10-29. |
| Elliptic++ data, model, explanations, voice STT/TTS, explorer client, artifact fetch | **Reported, not re-run here** | Described by the earlier Cryptiq run (its notes are in a separate project outside this repository). The data and model are not in this repo, so a fresh clone cannot run Wallet Guard without your own private `ARTIFACTS_REPO`. |
| Benchmark (raw dump vs graph evidence) | **Reported, not re-run here** | One earlier run (N=25, one model, one seed, no significance test) found the compact graph-evidence method cheaper in tokens but less accurate on licit wallets. Treat it as an anecdote, not a result. |
| Frontend screens (Wallet Guard, Credits, Copilot, councils, statement panel, landing) | **Partly contradicted by the audit** | An earlier session reported a browser pass. The 2026-10-29 audit found real defects in the same screens (for example the mobile bottom navigation never rendered, BUG-025; hashes and addresses shown with Devanagari digits in Hindi/Marathi, BUG-003). Treat the screens as working on desktop in English only until the open bugs are closed and re-tested. |
| Wispr Flow voice | **Never run** | No Wispr Flow key was available. The provider chip only says "Wispr Flow" if the service reports that provider for a clip. |
| EAS attestation on Base Sepolia | **Never run** | The schema must be registered once on Base Sepolia and its UID set in `NEXT_PUBLIC_EAS_SCHEMA_UID`; until then the sign button stays disabled and only the simulated preview works. Wallet signing has not been tried with a real wallet. |
| WalletConnect | **Optional, never run** | Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` only browser and extension wallets are offered. |
| Dodo Payments test checkout | **Never run live** | Needs `DODO_API_KEY`, a webhook on `/api/crypto/webhooks/dodo` with `DODO_WEBHOOK_SECRET`, and real product ids in `PACKS_JSON`. Signature check and idempotency are covered by unit tests only. |
| Bitcoin testnet invoice end to end | **Never run** | No receive address or test coins were available. XMR has no automatic confirmation by design. |
| Deployment | **Nothing verified** | No deployment of any part has been checked. The Vercel function size limit for the FinPilot API is untested (installed requirements measured 398 MB in the audit; Vercel's limit is believed to be 250 MB, unverified). See the deployment section of the architecture doc. |

## Known limitations

- **The data is old research data.** Elliptic++ covers wallets active roughly 2016 to 2018 (inferred from block heights in the dataset's own notebooks, not confirmed from the paper). Almost any wallet checked today will come back **UNKNOWN**. The live value is mostly the OFAC list plus dataset hits.
- **A verdict is a risk signal, not an accusation.** Demo addresses are real public Bitcoin addresses carrying a research-dataset label; present them as "labelled illicit in the Elliptic++ research dataset".
- **UNKNOWN is not safe.** It means "not in the dataset". The Chain Analyst treats it as an abstention, and the UI must never show it as a green all-clear.
- **Model behaviour under drift.** On the test split the graph-feature model improves PR-AUC (0.4342 vs 0.3394) and the BLOCK-level F1 (0.4637 vs 0.1670), but at the WARN threshold its F1 is lower (0.2223 vs 0.3151) and it flags 22,049 of 87,562 licit test wallets (25.2 %). Nothing was tuned on the test split. Treat WARN as a weak signal.
- **TigerGraph engine is not in the free path by default.** A deployment without TigerGraph uses the NetworkX engine, which needs about 2.6 GB of RAM (measured); the scorer alone needs about 1 GB.
- **The statement's audit hash is now a real SHA-256 (fixed after review).** FinPilot originally printed `Hash: SHA256:<code>...`, which was only the first 16 characters of a base64 of the user id and period, so it proved nothing about the data. It is now the SHA-256 of the canonical JSON of the figures the statement prints (balances, income, expenses, health score, forecast, and a digest of the transactions; no names or merchants). The canonical JSON is shown next to the hash, and for the two demo personas tried (Priya, Arjun) the printed value equals an independent `sha256sum` of that text. Limits: it fingerprints the figures, it is not a signature, and anchoring it on Base Sepolia only timestamps it. The in-browser implementation is checked against Node's `crypto` by `frontend/scripts/check-statement-hash.mjs` (314 inputs, 0 mismatches).
- **Data licence.** Elliptic++ has no stated licence. The dataset, the derived tables and the trained model (a pickle) must **stay out of this repository** and out of any public image. They are loaded at runtime from a private store (a private Hugging Face dataset repo via `crypto-service/scripts/fetch_artifacts.py`). Only fetch `model.joblib` from a repo you control.
- **Known wording problem.** One explanation says a wallet "is part of a cluster of 822,935 wallets"; that is the size of the connected component, which is nearly the whole graph, so "cluster" is misleading. Not fixed.
- **Free LLM tiers rate-limit.** A burst of checks can hit HTTP 429 and fall back to template explanations (never an error). The first uncached calls after a cache miss can take as long as the 8 s explanation deadline.
- **No Marathi in the crypto service.** It speaks English and Hindi; the Copilot sends Marathi as Hindi.

## Where to go next

- Architecture, deployment and the environment variable table: [CRYPTPILOT_ARCHITECTURE.md](CRYPTPILOT_ARCHITECTURE.md)
- Run everything locally: `scripts/run_cryptpilot_demo.sh` (macOS / Linux) or `scripts/run_cryptpilot_demo.ps1` (Windows, untested)
- Crypto service API: `docs/crypto-service-api-contract.md`, `docs/crypto-service-openapi.json`, `crypto-service/README.md`, `crypto-service/DECISIONS.md`
