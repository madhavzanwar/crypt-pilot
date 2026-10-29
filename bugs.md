# CryptPilot: consolidated bug report

Audit date: 2026-10-29. Target: `madhavzanwar/crypt-pilot` `main` (FinPilot x Cryptiq), running live: frontend `:3100` (production build),
FinPilot API `:8000`, crypto-service `:8132` (NetworkX engine, real Elliptic++ data). **Nothing has been fixed in this document: it is findings only.**

Eight read-only auditors worked in parallel. Findings were de-duplicated (several auditors hit the same bug; their IDs are listed in **Source**).

| Auditor | Slice | Status |
|---|---|---|
| A1 | Live desktop UI crawl: 31 routes x 3 personas | complete (28 findings) |
| A2 | Mobile/tablet, accessibility (axe), keyboard | complete (21 findings) |
| A3 | Functional + adversarial test of Wallet Guard, credits, attestation, Copilot, councils | complete up to a requested early stop (13 findings; 0-credit/402 path, 429 UI, dashboard tile, twin form not reached) |
| A4 | FinPilot backend: 112 API operations x 3 personas, test suite, merge review | complete (8 findings + 4 test root causes) |
| A5 | crypto-service + bridge: tests, fuzzing, races, webhook, invoices | complete (22 findings) |
| A6 | Frontend static code audit, eslint, dependencies | complete (25 findings) |
| A7 | Hindi/Marathi, copy, naming, claims | complete (24 findings) |
| A8 | Security, secrets in git history, deployment, repo hygiene | complete (19 findings) |

**Origin tags:** `[M]` introduced by the merge / new CryptPilot code; `[P]` pre-existing in FinPilot (also in the untouched original);
`[C]` in the Cryptiq crypto-service.

**Priority scale:** P0 = broken / security-critical / money or data wrong / false claim on a primary screen. P1 = clearly wrong behaviour that
users hit, or a serious misconfiguration. P2 = polish, hardening, edge cases. P3 = nit.

## 0. Environment facts that affect reading this report

- **TigerGraph Savanna is suspended.** `GET <TG_HOST>/restpp/echo` returns `500 "Failed to start workspace"`. Savanna auto-suspends idle
  workspaces; only the owner can resume it in the Savanna console. For the audit the crypto-service ran on the local NetworkX engine (same data), so
  every TigerGraph claim in the UI was tested against `engine: networkx`.
- **No Gemini/NVIDIA key is set for FinPilot's own AI** in this sandbox, so `POST /api/translate` returns `{"translations":{}}` and the Copilot/council
  run rule-based. English text appearing in Hindi/Marathi views partly reflects that (A7).
- **Test baseline (before any fix):** backend 460 passed / 4 failed (the same 4 fail on the untouched FinPilot); `tsc` 0 errors;
  `eslint` 13 errors + 24 warnings; `next build` passes (35 routes). Crypto-service: 208 passed, 3 skipped.
- The sandbox clock is 2026-10-29. Several FinPilot tests and statement dates depend on "today" (BUG-016, BUG-034).

## Summary

| Priority | Count |
|---|---|
| P0 | 6 |
| P1 | 25 |
| P2 | 42 |
| P3 | 33 |
| **Total** | **106** |

Ten bugs were independently found by two or more auditors (BUG-002, 003, 004, 006, 016, 017, 023, 038, 039, 043); the rest were found by one.


## Round 2 status (fix/round-2, merged to main)

Of 106 IDs: **72 fixed**, **28 partial**, **5 open**, 1 not reproduced. 'fixed' means the code change is merged and was checked by a test and/or a live run (see docs/INTEGRATION_NOTES.md for what each check was); it does not mean tested against real Dodo, Wispr, TigerGraph, a wallet or a deployed host.

| ID | Status | Note |
|---|---|---|
| BUG-001 | fixed | Next 16.4.3; 63 other advisories remain (BUG-052) |
| BUG-002 | fixed |  |
| BUG-003 | fixed |  |
| BUG-004 | partial | landing strip is status-driven; the README tagline still names TigerGraph |
| BUG-005 | fixed |  |
| BUG-006 | fixed |  |
| BUG-007 | fixed |  |
| BUG-008 | fixed |  |
| BUG-009 | partial | removed from tree; still in git history (purge needs owner approval) |
| BUG-010 | partial | workflows manual-only; focal/ kept |
| BUG-011 | partial | CSP is Report-Only on purpose (untested with wallet connect / Plaid / Dodo / Google sign-in); other headers enforced |
| BUG-012 | partial | code-side done; real Vercel build unverified |
| BUG-013 | fixed |  |
| BUG-014 | fixed |  |
| BUG-015 | fixed |  |
| BUG-016 | fixed |  |
| BUG-017 | fixed |  |
| BUG-018 | fixed |  |
| BUG-019 | fixed |  |
| BUG-020 | fixed |  |
| BUG-021 | partial | P10=P50 and free-cash-flow mismatch not investigated |
| BUG-022 | partial | income 100,161 aligned; plan income 99,790 and dashboard recurring 75,056 vs budgets 58,773 still differ |
| BUG-023 | partial | server-built rupee strings and literal rupee labels remain |
| BUG-024 | fixed |  |
| BUG-025 | partial | login+landing fixed; not re-checked at 768 |
| BUG-026 | partial | axe not run; Escape focus on Credits drawer unverified |
| BUG-027 | partial | sidebar, dashboard tile and some components still English in hi/mr |
| BUG-028 | fixed |  |
| BUG-029 | partial | og-image still the old FinPilot card |
| BUG-030 | fixed |  |
| BUG-031 | fixed |  |
| BUG-032 | fixed |  |
| BUG-033 | fixed |  |
| BUG-034 | fixed |  |
| BUG-035 | fixed |  |
| BUG-036 | fixed |  |
| BUG-037 | fixed |  |
| BUG-038 | partial | council calls without a forwarded IP share the loopback bucket |
| BUG-039 | fixed |  |
| BUG-040 | fixed |  |
| BUG-041 | fixed |  |
| BUG-042 | partial | bundle size not measured |
| BUG-043 | fixed |  |
| BUG-044 | fixed |  |
| BUG-045 | fixed |  |
| BUG-046 | partial | non-English BIP-39 lists not covered |
| BUG-047 | fixed |  |
| BUG-048 | fixed |  |
| BUG-049 | partial | per-IP cap only applies when CRYPTO_TRUST_PROXY=true or the peer is public (see INTEGRATION_NOTES) |
| BUG-050 | fixed |  |
| BUG-051 | fixed |  |
| BUG-052 | partial | npm audit fix without --force: 66 -> 63 vulns |
| BUG-053 | partial | no licence chosen: needs the owner |
| BUG-054 | fixed |  |
| BUG-055 | partial | CommandPalette and README wording done; household page done |
| BUG-056 | fixed |  |
| BUG-057 | partial | tooltip spacing/lakh grouping not browser-verified |
| BUG-058 | fixed |  |
| BUG-059 | fixed |  |
| BUG-060 | fixed |  |
| BUG-061 | fixed |  |
| BUG-062 | partial | defaults seed from data when present |
| BUG-063 | fixed |  |
| BUG-064 | fixed |  |
| BUG-065 | fixed |  |
| BUG-066 | fixed |  |
| BUG-067 | fixed |  |
| BUG-068 | fixed |  |
| BUG-069 | partial | /statement still has 2 h1; heading order, label-content-name remain |
| BUG-070 | partial | mobile 44px done; desktop not |
| BUG-071 | fixed |  |
| BUG-072 | fixed |  |
| BUG-073 | fixed |  |
| BUG-074 | fixed |  |
| BUG-075 | fixed |  |
| BUG-076 | fixed |  |
| BUG-077 | open | not touched |
| BUG-078 | open | public by design; restrict key + App Check |
| BUG-079 | fixed |  |
| BUG-080 | fixed |  |
| BUG-081 | fixed |  |
| BUG-082 | open | report only: frontend/public/public unreferenced, not deleted |
| BUG-083 | fixed |  |
| BUG-084 | partial | pacing kept (frontend animation depends on it); now configurable |
| BUG-085 | fixed |  |
| BUG-086 | fixed |  |
| BUG-087 | partial | SSE endpoint at zero credits untested |
| BUG-088 | fixed |  |
| BUG-089 | fixed |  |
| BUG-090 | partial | refunds/disputes recorded for manual review, credits not revoked |
| BUG-091 | fixed |  |
| BUG-092 | partial | recharts warnings not re-measured; Twin category labels from backend |
| BUG-093 | not reproduced |  |
| BUG-094 | open | report only: dead files listed, none deleted |
| BUG-095 | open | not touched |
| BUG-096 | partial | eslint 0 errors; a few justified disables remain |
| BUG-101 | fixed |  |
| BUG-102 | fixed |  |
| BUG-103 | fixed |  |
| BUG-104 | fixed |  |
| BUG-105 | fixed |  |
| BUG-106 | fixed |  |
| BUG-107 | fixed |  |
| BUG-108 | fixed |  |
| BUG-109 | fixed |  |
| BUG-110 | fixed |  |

---

# 1. P0: fix first

### BUG-001 [M/P] `next` 16.3.6 has critical unauthenticated remote-code-execution advisories — **[fixed]**
- **Where:** `frontend/package.json` (`next@16.3.6`, `eslint-config-next`).
- **Observed:** `npm audit --omit=dev` reports **66 vulnerabilities: 1 critical, 26 high**. The critical ones are in Next itself: GHSA-2464-fhr4-w9xw
  (Image Optimization with SVG) and GHSA-673q-mjm6-r5xr (`use cache` typed arrays), both unauthenticated RCE for Next 16.0.0 to 16.4.0. The same
  version range also has an Image Optimization SSRF, a Server Actions DoS and cache poisoning. The app uses `next/image`, so `/_next/image` is mounted.
- **Impact:** if deployed on any host that serves the Next server, a remote attacker needs no account. (Exploitation was not attempted.)
- **Fix:** `npm i next@16.4.3 eslint-config-next@16.4.3` (a patch/minor bump). Re-run `next build` and the e2e pass. Do **not** apply `npm audit fix --force`:
  its suggested "fixes" for `firebase`, `inngest` and `rainbowkit` are downgrades.
- **Source:** A8-1, A6 (npm audit).

### BUG-002 [P] `GET /api/household/{id}/insights` returns HTTP 500 for any household with spending — **[fixed]**
- **Where:** `backend/app/api/household_router.py:554` (also uses at 581 and 636) vs `backend/app/schemas.py:761`.
- **Repro:** `curl http://localhost:3100/api/household/demo-priya/insights` -> `500`. In the UI, `/household` (Priya): the Monthly Spending, Top Categories
  and Income vs Spend cards all say "Not enough data yet".
- **Root cause:** the router redefines a local `CategorySpend(category, amount)` that **shadows** the imported `schemas.CategorySpend(total, by_member)`.
  Line 513 builds the schemas shape, then Pydantic validates against the wrong class and raises "amount Field required".
- **Fix:** rename the local class (lines 554, 581, 636) to `SpendCategory`. Add a test that calls the route for `demo-priya`.
- **Source:** A1-1, A4-1.

### BUG-003 [M] In Hindi/Marathi, hashes and addresses are shown with Devanagari digits (statement hash unverifiable, addresses corrupted) — **[fixed]**
- **Where:** `frontend/components/AutoTranslate.tsx:8-9` (`toDev()` digit conversion); affected spans in `components/crypto/guard/VerdictCard`, `GraphList`,
  `NodeDrawer`, `components/crypto/council/ChainParts`, `components/crypto/web3/Bits`, `components/statement/StatementAnchorPanel`.
- **Observed:** with the language set to hi or mr, `/statement` prints the SHA-256 as `0x२e५८…`; a wallet address becomes `१Q८f६c…`; UUIDs and the PAN
  `AADPS९१०२K` are altered; truncated addresses are also sent to `/api/translate`. The backend translate prompt says to keep 0-9, but the client converts anyway.
  Evidence: `/tmp/claude-0/audit/A7/shots/stm_hi_anchor.png`.
- **Impact:** the audit hash can no longer be compared with `sha256sum`; a user who copies a displayed address gets a different (invalid) string. This defeats
  the "verifiable" purpose of the statement hash and corrupts the one thing the Wallet Guard must show exactly.
- **Fix:** add `translate="no"` and `[translate=no]` to the SKIP / SKIP_DIGITS selectors in `AutoTranslate`, and set `translate="no"` (plus `lang="en"` and
  `font-variant-numeric` as needed) on every hash/address/id span. Never run digit conversion on tokens containing `[0-9a-fx]{8,}`.
- **Source:** A7-1, A7-5, A6-1.

### BUG-004 [M] False product claims: TigerGraph and Wispr Flow named where they are not in use — **[partial]**
- **Where:** `frontend/app/page.tsx:270` (landing "Built with" strip and trust badges); `lib/crypto/voice/strings.ts:66-67` (hi/mr chips);
  `components/dashboard/WalletGuardTile` copy (fixed once, residue elsewhere); `README.md:387`, `docs/CRYPTPILOT_ARCHITECTURE.md`, `docs/GO_LIVE.md` present TigerGraph as the default engine.
- **Observed:** the landing page says "TigerGraph · graph evidence" and "Wispr Flow · voice" unconditionally. `/api/crypto/status` reports
  `engine: networkx` (Savanna is suspended) and `voiceProvider: sarvam`; Wispr has never been called (no key). The Hindi/Marathi Copilot chip says
  "TigerGraph के सबूत…" while the English chip was corrected to "graph evidence".
- **Impact:** the project's own rule is "name a provider only if it ran". A judge or user reading the landing page is told things the running system is not doing.
- **Fix:** make the "Built with" strip describe supported integrations ("supports TigerGraph / Wispr when configured") or drive it from `/api/crypto/status`;
  fix the hi/mr chip strings; adjust docs to say "TigerGraph when configured, NetworkX fallback".
- **Source:** A7-2, A7-3, A7-19.

### BUG-005 [C] A paid Dodo webhook that cannot be matched to a pack is acknowledged, marked processed, and the customer gets nothing; unknown session ids mint credits — **[fixed]**
- **Where:** `crypto-service/app/routers/webhooks.py:36-47`; `app/services/billing/ledger.py:34-36` (`add_credits` creates sessions).
- **Repro (own instance, throwaway secret):** a correctly signed `payment.succeeded` with `metadata.pack_id = "enterprise"` returns `{"ok": true}`, adds no credits, and the
  same webhook-id then returns `duplicate`. Separately, a signed event with an **unknown `session_id`** creates a ghost session holding the pack's credits.
- **Impact:** a real customer who paid (e.g. product id or metadata changed after a pack edit) is never credited and Dodo will not retry because it received 200.
  Conversely, the ghost session lets a signed event credit nobody.
- **Fix:** if the pack/session cannot be resolved return 5xx (so Dodo retries) or record the event as `unmatched` and alert; do not mark processed. Make `add_credits`
  refuse to create sessions. Add a product-id/amount check against `PACKS_JSON`.
- **Source:** A5-2, A5-2b.

### BUG-006 [M] Wallet-guard deep link `?address=…&run=1` spends a credit for any address, and the check key includes the UI language (language switch = second paid check) — **[fixed]**
- **Where:** `components/crypto/guard/WalletGuard.tsx` (auto-run on `run=1`), `WalletVerdictCard.tsx:41`, `lib/crypto/useWalletCheck.ts:55`, `crypto-service/app/services/pipeline.py:163`.
- **Observed/scenario:** (a) a crafted link `/wallet-guard?address=<valid>&run=1` runs a billable check as soon as a signed-in visitor opens it; the earlier fix only
  removed auto-run for links without `run=1`. (b) the in-memory/cache key contains `lang`, so toggling language while a wallet card is visible triggers another paid check;
  Marathi maps to English in Wallet Guard but to Hindi in Copilot.
- **Impact:** silent credit loss; a hostile link can burn a victim's balance.
- **Fix:** auto-run only when the address was checked in this session (`findRecent` hit => free), otherwise prefill only. Latch `lang` at the first run and use one shared
  language-mapping helper.
- **Source:** A6-4, A6-5, A3-9 (confirmed live: 100 -> 99 and 99 -> 98 with no click), earlier reviewer finding.

---

# 2. P1: clearly wrong behaviour or serious misconfiguration

## 2.1 Security, repository and deployment

### BUG-007 [P] `/api/ops/overview` and `POST /api/ops/probe/{env}` are unauthenticated and reachable through the frontend origin — **[fixed]**
- **Where:** `backend/app/api/ops_router.py:59`; exposed via `frontend/next.config.ts` rewrite `/api/:path*`.
- **Observed:** `curl http://localhost:3100/api/ops/overview` -> 200. It returns provider keys masked as first-5 + last-4 characters, agent telemetry and the **web-search queries users typed**; the probe spends provider quota. In this
  environment no provider keys are set so nothing leaked, but on a configured deployment the masked keys and queries would be public. README says "Agent Ops" was removed, but only its nav entry was.
- **Fix:** require auth/an admin token or do not mount in prod; reduce the mask to "set / not set"; drop `searches[].query`; remove the unused router if the feature is gone.
- **Source:** A8-2.

### BUG-008 [P] Unauthenticated, unmetered endpoints that spend third-party AI/search budget — **[fixed]**
- **Where:** `backend/app/api/translate_router.py:17`, `web_router.py:57-123`, `/api/chat`, `/api/voice/act`; `core/auth.py` (`guest-<12+ chars>` ids are self-minted).
- **Observed:** `/api/translate` has no auth and no limit; `/api/web/*` has one shared 30/min bucket (one client can starve everybody); `/api/chat` and `/api/voice/act` are limited per `user_id`, which an
  attacker rotates by minting new `guest-…` ids.
- **Impact:** anyone can burn Gemini/NVIDIA/Tavily budget.
- **Fix:** per-IP limits, a token, or a Turnstile-style check; remove removed-feature routes from the rewrite.
- **Source:** A8-3.

### BUG-009 [P] Real personal data in the public repository — **[partial]**
- **Where:** `api-use-case.pdf` (repo root, tracked, public; also in history).
- **Observed:** contains a real applicant name ("Veerbhadra") and a personal Gmail address (masked `mahan****@gmail.com`).
- **Fix:** `git rm` it; if the owner wants it gone from history use `git filter-repo` (a history rewrite, needs explicit approval and a force-push).
- **Source:** A8-5.

### BUG-010 [P] Both inherited GitHub Actions fail on every push to `main`; the Pages workflow would publish an unrelated app — **[partial]**
- **Where:** `.github/workflows/deploy-vercel.yml`, `deploy-gh-pages.yml`; `focal/` still exists.
- **Observed:** 10 of 10 runs failed. Vercel: `Input required: vercel-token` (secrets missing). It uses `--prod` with no environment gate, so once secrets exist **every merge deploys to production**.
  Pages: builds the old `focal/` Vite app and fails only at `configure-pages enablement:true`; if Pages is ever enabled it publishes the unrelated Focal app.
- **Fix:** delete the Pages workflow and `focal/`; gate the Vercel workflow (`environment` with required reviewer, or `workflow_dispatch`).
- **Source:** A8-4.

### BUG-011 [P] No HTTP security headers on the frontend or the FinPilot API — **[partial]**
- **Where:** `frontend/next.config.ts`, `backend/app/main.py`.
- **Observed:** no CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy`; Next sends `X-Powered-By: Next.js`. Only crypto-service sets nosniff/no-referrer/DENY/HSTS.
- **Fix:** `headers()` in `next.config.ts`, `poweredByHeader:false`, and a FastAPI middleware with the same set.
- **Source:** A8-6.

### BUG-012 [M/P] The FinPilot Python function probably cannot be deployed to Vercel as configured — **[partial]**
- **Where:** `vercel.json` (`maxLambdaSize: 500mb`, no `maxDuration`), `backend/api/index.py`, `backend/requirements.txt`.
- **Observed:** installing `requirements.txt` into a scratch directory is **398 MB** (googleapiclient 109 MB, pandas 75, numpy 43+25, google 32). I believe Vercel's limit is 250 MB (unverified); no deploy was run.
  `/api/crypto/check` allows 60 s but there is no `functions.maxDuration`; Vercel rejects bodies over 4.5 MB (the bridge allows 6 MB, A4-5). The RAG cache and a telemetry file write into the code directory (read-only on serverless).
  `CRYPTO_SERVICE_URL` has no production value documented and defaults to `127.0.0.1:8200`.
- **Fix:** do a real Vercel build; trim dependencies or host the API as a container; set `maxDuration`; cap body size at ~4 MB on Vercel; write caches under `/tmp`; document `CRYPTO_SERVICE_URL`.
- **Source:** A8-12, A4-5.

### BUG-013 [C] A crypto-service container started without `APP_ENV` runs in dev mode with the published placeholder secrets — **[fixed]**
- **Where:** `crypto-service/Dockerfile`, `.env.example`.
- **Observed:** no `ENV APP_ENV=prod` in the image; the example defaults to `dev`, `SESSION_SECRET=change_me`, `COOKIE_SECURE=false`, and the benchmark-run admin check is only enforced in prod. `fly.toml` sets prod, plain `docker run` does not.
- **Impact:** sessions signed with a public secret (anyone can forge credits sessions), non-Secure cookies, `/api/benchmark/run` open.
- **Fix:** `ENV APP_ENV=prod` in the image and refuse to start prod with placeholder secrets (the code already does so in prod, so setting the env is enough).
- **Source:** A8-11.

### BUG-014 [P] Dependency vulnerabilities in the Python backend — **[fixed]**
- **Where:** `backend/requirements.txt` (pip-audit).
- **Observed:** `pillow` 11.3.0 (dozens of advisories, fix 13.0.0; the app OCRs uploaded images); `python-multipart` 0.0.20 (6, fix 0.0.31+); `starlette` 0.41.3 via `fastapi` 0.115.6 (Range DoS, others);
  `python-dotenv` 1.0.1 (1, fix 1.2.2); `google-cloud-firestore>=` and `python-dateutil>=` unpinned. crypto-service `uv.lock`: pip-audit clean.
- **Fix:** bump and pin; re-run the backend suite.
- **Source:** A8-7.

## 2.2 Money, credits and correctness (crypto-service and bridge)

### BUG-015 [C] A non-ASCII `cryptiq_sid` cookie returns HTTP 500 — **[fixed]**
- **Where:** `crypto-service/app/session.py:26` (`hmac.compare_digest` on `str`).
- **Repro:** `curl -H 'Cookie: cryptiq_sid=abc.é' http://127.0.0.1:8132/api/credits` -> 500; same through the bridge.
- **Fix:** compare bytes (`.encode()`), or guard with `isascii()` and treat failures as "new session".
- **Source:** A5-1.

### BUG-016 [C/M] `check_wallet` reports every non-200 as "Chain Analyst offline: the crypto service could not be reached" — **[fixed]**
- **Where:** `backend/app/crypto_bridge/client.py:417-419`, `backend/app/security/chain_analyst.py:98-106` (+ `valid_address` has no checksum validation).
- **Observed:** a bech32 address with a bad checksum gets **400** from the service; with a 5/min limit, calls 6-8 get **429**; both are shown to the user as "service could not be reached", and the offline result skips caching.
- **Fix:** return `{status:"error", error:code}` for non-200; map 400 -> "rejected: invalid address", 429 -> "rate limited, retry", 5xx/network -> offline; checksum-validate in `valid_address`.
- **Also confirmed live in the UI (A3-8):** `/council` with `1Q8f6cESGGLkiExCwhnPCTzyLqmAUZg3Wv` (valid format, bad checksum) says "offline: the crypto service could not be reached" while the service is up; reproduced twice (UI and `POST /api/security/demo-priya/council`).
- **Source:** A5-3, A3-8 (+ earlier reviewer finding).

### BUG-017 [C/M] An UNKNOWN-only (or offline-only) council/evidence run reads as "all clear" — **[fixed]**
- **Where:** `backend/app/security/council.py:236-241`, `chain_analyst.py:167-211`, `agents.py:294`.
- **Repro:** `POST /api/security/.../council` with only `DEMO-notindataset`: returns level low / score 22, identical to a run with no wallets, `voted:false`. The evidence step reports `findings:0, screened:1` and
  `verdict_for(...)` can say "No security problems found. All checks came back clean".
- **Impact:** violates the product's own rule "UNKNOWN is not safe".
- **Fix:** surface an explicit "unverified wallet(s)" state and caveat in `what_to_do` / verdict whenever wallets were requested and any is UNKNOWN or offline.
- **Source:** A5-4, review finding F10.

### BUG-018 [M/P] Backend: disconnecting ANY connector wipes a guest's whole ledger — **[fixed]**
- **Where:** `backend/app/api/connectors_router.py` `disconnect` route: `if user_id not in DEMO_USER_IDS: _clear_user(user_id)` runs for every connector (same in the original).
- **Repro (from code reading, not executed):** `curl -X DELETE localhost:8000/api/connectors/guest-abcdefghijkl/bank`.
- **Impact:** a guest who disconnects a dataset-only connector loses all their data.
- **Fix:** clear only when the connector actually seeded data (google_pay, google_sheets, plaid).
- **Source:** A4-2.

## 2.3 Product screens: wrong or misleading data (desktop)

### BUG-019 [P] Household page: "Family spending" card collapses and is overlapped (Priya) — **[fixed]**
- **Where:** `/household`, probably a flex/grid child without `min-w-0` (file unconfirmed).
- **Observed:** the card shrinks to about 70 px with vertically wrapped text and is overlapped by "Household Co-Pilots" (`crops/Priya_household_1.png` to `_3.png`). Partly a consequence of BUG-002 (empty-state sizing).
- **Source:** A1-2.

### BUG-020 [P] Household API 404s for Arjun and Meera produce console errors (empty state unverified) — **[fixed]**
- **Where:** `/api/household/demo-arjun` and `/insights` -> 404 "User does not belong to any household" (the seed removes Arjun's membership, see BUG-034).
- **Source:** A1-12.

### BUG-021 [P] Statement: several amounts and labels are wrong — **[partial]**
- **Where:** `/statement` (Priya), `components/statement/ExecutiveStatement.tsx` and the backend text builders.
- **Observed:**
  - Lane 3 badges read "**+-₹9,833 NET GAIN**" and "+-₹8,831 NET GAIN"; text says "saves ~₹9833" without a thousands separator (a "+" prefixed to an already signed value).
  - Liabilities are listed by raw UUID ("3cd99dff-8c5a-4fe5-B3c7-C1bb437c9181 (9.5% APR)") instead of the account name.
  - "Recommended actions" text leaks a Python list and an internal id: `Cancel subscription(s) ['rg-cult.fit-membership'] -- +1490/month`.
  - Several "Next" dates are in the past (amazon.in 21 Oct, apollo 17 Oct, dmart 21 Oct); Audit Timestamp reads "29 Sep 2026" and the period "2026-09" while "Certified on 29 October 2026" appears on the same page.
  - P10 equals P50 (both ₹2,97,280) and baseline "free cash flow -₹7,048" contradicts the dashboard's +₹11,521; the "Lane 2" card is empty (unconfirmed whether P10=P50 is wrong).
- **Fix:** format signed amounts once; resolve account ids to names; build titles from structured data, not `str(list)`; roll recurring "next" dates forward; derive the period from the statement window (BUG-040).
- **Source:** A1-3, A1-4, A1-5, A1-8, A1-22, A7-6.

### BUG-022 [P] Recurring payments, budgets and safe-to-spend disagree with each other — **[partial]**
- **Where:** dashboard ("No recurring payments found yet") vs `/statement` (about 12 recurring obligations) vs `/budgets` ("committed recurring ₹106,092/mo" > income ₹99,420).
- **Observed:** budgets shows "₹0 Available Today" with a **green** badge and "₹0/day safe pace"; monthly income is ₹1,00,157 (dashboard), ₹99,420 (budgets), ₹99,791 (plan/forecast).
- **Fix:** one source for recurring items and income; never show a green state for zero; investigate double counting.
- **Source:** A1-6, A1-7, A1-21.

### BUG-023 [P] Currency switcher leaves ₹ in many places; negative formatting is wrong — **[partial]**
- **Observed:** after switching to USD/EUR/GBP: dashboard chart axes still read "₹0 / ₹20k", the budgets basis sentence is in ₹, `/financial-security` and `/simulate` are almost all ₹ (22 of 23 on /simulate), `/statement` shows 35 ₹ and 75 $ together. Elsewhere "₹-303 monthly", "₹-650 monthly" (sign after symbol) and 5 occurrences of "-₹0" on `/plan` (Meera). "Subscription leakage" shows 2 findings but ₹0.
- **Cause:** components bypass `useCurrency().formatAmount`; server-built strings are always ₹.
- **Source:** A1-9, A1-10, A1-11.

### BUG-024 [P] Transactions review queue skips every second card and the Enter key confirms from any button — **[fixed]**
- **Where:** `frontend/app/(app)/transactions/page.tsx:616,665,620,643`.
- **Scenario:** each review advances `currentIndex` **and** refetches a queue that drops the reviewed item, so every second card is skipped; the effect at `:620` wipes in-progress edits on any refetch; the global Enter handler excludes only INPUT/TEXTAREA/SELECT so pressing Enter on a focused button also confirms; effect deps are stale (eslint `exhaustive-deps`).
- **Fix:** always show `queue[0]` with the form keyed by `txn.id`; exclude buttons/links in the handler; read the latest handler through a ref.
- **Source:** A6-2, A6-3.

## 2.4 Mobile, tablet and accessibility

### BUG-025 [M] Mobile layout: the bottom navigation is never rendered; header overlaps; login and landing overflow — **[partial]**
- **Observed:**
  - `MobileBottomNav` is not imported by anything (DOM check false on every route); phones get only a 28 px hamburger and the chat/mic floating buttons still reserve `bottom-20` for it and overlap content (A2-5).
  - At 360/390 px the page title ("Dashboard", "Wallet Guard") is overlapped by the search and hide-amount icons (A2-2).
  - At 768/820 px the Credits pill (x=771-844) and the bell (x=852-888) are off-screen, so the Credits drawer is unreachable from the header (A2-1).
  - `/login` at 360 px: the card runs 24 px past the right edge and the language select is clipped; at 390 it is off-centre (A2-3). `/` at 360/390: header nav overflows and "Sign in" is cut off (A2-4).
  - Sidebar drawer at 360x640 / 390x844: the pinned persona/Sign-in footer covers "Twin Simulator" and "More"; the list scrolls but scrollbars are hidden globally, so there is no cue (A2-6).
  - `html`/`body` are `overflow-x: hidden`, so these overflows are clipped, not prevented.
- **Where:** `components/NavShell.tsx` (header actions `shrink-0`), `app/login/page.tsx`, `app/page.tsx`, `globals.css`.
- **Source:** A2-1..A2-6.

### BUG-026 [M/P] Accessibility failures that block keyboard and screen-reader users — **[partial]**
- **Observed (axe + manual keyboard):**
  - **Contrast** (1,174 nodes on 56 pages): pewter `#7487a3` on white 3.66 (on `#f1f2ec` 3.25); ember `#ff6b1a` on `#f8f9ef` 2.68; white on ember 2.84 (the "9+" badge); `#e0540a` on `#fffaf4` 3.71; lime text `#c6f135` on white 1.30; leaf `#0fb67a` on tint 2.28 (A2-9).
  - **No skip link**; `/wallet-guard` takes about 25 Tabs to reach the address input (A2-8).
  - **Focus is lost**: Escape closes the Credits and sidebar drawers but focus drops to `BODY`; the sidebar drawer opens with focus on "More" (A2-7). The header language `<select>` has no visible focus ring (A2-10).
  - **Critical axe**: 14 unlabeled file inputs on `/photos` and `/tax` (`label`), 6 unlabeled selects on `/household` and `/transactions` (`select-name`), landing page `button-name` x6, `aria-required-parent` x4 (missing tablist), `nested-interactive` x2 (A2-11..A2-13).
- **Fix:** darken the three text tokens to meet 4.5:1, add a skip link and `main` id, return focus to the trigger (use Radix `Trigger`), label the inputs, give the tablist role.
- **Source:** A2-7..A2-13.

## 2.5 Language, branding and leftovers

### BUG-027 [M] Hindi/Marathi coverage is incomplete on primary flows — **[partial]**
- **Observed:**
  - `/wallet-guard` is entirely English in Marathi (`components/crypto/guard/copy.ts` has only en/hi columns) (A7-4).
  - Credits pages, Connect, the dashboard Wallet Guard tile body are English in hi/mr (A7-7); sidebar items (Simulate, Forecast & Risk, Evidence/Risk Council, Twin Simulator, More, Upload document, Plan, My Data, Profile, "Sign in") and the top-bar page title stay English above a Hindi h1 (A7-8); landing and login subtitle are English (A7-9).
  - **103 `t()` keys have no hi/mr entry** (`cr.*`, `d.wg_*`, `nav.More`, `stmt.anchor.*`, about 75 `web3.*`); several components bypass `t()` completely (credits page and return pages, `ActivityTable`, `CryptoInvoice`, `InvoiceCard`, council page, `ChainParts`, `evidence-room`, twin wallet field, connect cards, `ChatPopup`) (A6 i18n).
  - Four competing translation mechanisms (`lib/i18n.ts`, `guard/copy.ts`, `voice/strings.ts`, `AutoTranslate`).
  - Dashboard Hindi is 2.8k Devanagari vs 961 Latin characters; /budgets 354 vs 1,548; /copilot 214 vs 790 (A1-19).
- **Source:** A7-4, A7-7, A7-8, A7-9, A6, A1-19.

### BUG-028 [M] The removed FinPilot Pay / UPI app is still live and installable — **[fixed]**
- **Where:** `/pay`, `/pay/qr`, `pay.webmanifest`, `lib/upi.ts`, `components/dashboard/PhonePairCard.tsx` (dead, 67 lines).
- **Observed:** the Google-Pay-style phone payments app that the merge was supposed to replace (Dodo + Cake Wallet) is still reachable and installable as a PWA, with no test-mode wording; `lib/api.ts` still carries `schemeAnalyst`, `web`, `ops*`, `snapPhoto` for removed pages.
- **Fix:** decide: remove the routes/manifest or label as demo and test-mode; delete dead API methods.
- **Source:** A7-12, A6.

### BUG-029 [M] Branding and link-preview metadata are inconsistent — **[partial]**
- **Observed:** title "CryptPilot" vs sidebar "FinPilot x CRYPTO" vs "Continue to FinPilot", "FinPilot Wealth Systems", "FinPilot's voice assistant" (A7-11); `public/og-image.png` is the old FinPilot card and `metadataBase` is `https://finpilot.ai` (A7-10, A6-22); every route `<title>` is just "CryptPilot"; no sitemap/robots (A7-16); breadcrumb says "FinPilot" on /photos and /security; "Compare, Tax & Ti…" truncated (A1-24).
- **Source:** A7-10, A7-11, A7-16, A6-22, A1-24.

---

# 3. P2

| ID | Status | Origin | Where | What happens | Fix | Source |
|---|---|---|---|---|---|---|
| BUG-030 | fixed | M | `components/crypto/credits/DodoCheckout.tsx` | After redirecting to Dodo, browser Back restores the page from bfcache with the pay button permanently disabled. | reset state on `pageshow` with `persisted`. | A6-15 |
| BUG-031 | fixed | M | `lib/currency.tsx:96` | `localStorage` read without try/catch in the root provider: with storage blocked the whole app is blank (no error boundary). | guarded `useSyncExternalStore`. | A6-6 |
| BUG-032 | fixed | P | `app/` | No `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere: a render exception shows the bare Next error page without the shell. | add all three. | A6-7 |
| BUG-033 | fixed | P | `globals.css` | `tw-animate-css` is installed but never imported: no `animate-in/out` rules in the built CSS, so the Credits drawer, dropdowns and tooltips have no enter/exit animation. | `@import "tw-animate-css";`. | A6-8 |
| BUG-034 | fixed | P | backend tests | **4 FinPilot tests fail** (also on the untouched original). Root causes: (1) `test_household::test_managed_member_lifecycle`: stale test, `seed.py:87` deletes Arjun's membership, use `demo-rishi` (lines 199, 202). (2) `test_seed_realism[demo-arjun]`: score 60 > cap 55 (`tests/test_seed_realism.py:11`) because the planted duplicate EMI is flagged by two agents plus the look-alike merchant (3 x 20): set the range to (20, 70) or de-duplicate findings. (3) `test_plan::test_demo_personas_get_seeded_plan_profiles`: **date-dependent**; `app/plan/history.py:29` treats the in-progress month as complete in the last 3 days of a month, failing on 10-29, 10-30, 10-31, 11-29, 01-29: always drop the current calendar month (a "drop unless last day" variant still fails on the 31st). (4) `test_rag::test_retrieve_dining_first`: the fake embedder in `tests/test_rag.py:25-30` is a 64-bucket hash-bag whose date tokens collide; widen `% 64` to `% 4096`. With all four fixes the suite was 464/464 at fake dates 10-29, 12-10, 04-20, 06-15. | see left | A4 |
| BUG-035 | fixed | M | `connectors_router.py` | The retired `google_pay` id is still accepted on connect (`LEGACY_IDS`) and for a guest wipes the ledger and re-seeds persona data though the connector is unlisted. | return 410 on connect for legacy ids, keep disconnect/export. | A4-3 |
| BUG-036 | fixed | M | `crypto_bridge/upstream.py` | One global `httpx.AsyncClient`: if Vercel runs each invocation in a fresh event loop a pooled connection raises `RuntimeError("Event loop is closed")`, which `_proxy` does not catch -> 500 `internal_error` (unconfirmed on Vercel). | per-request client on Vercel or catch and rebuild. | A4-4 |
| BUG-037 | fixed | M/C | `crypto_bridge` limiter, `core/ratelimit.py` | (A3-6: the limiter is keyed on the peer IP and counts 400s too; behind the Next rewrite without `CRYPTO_TRUST_PROXY` all visitors would share 30 checks/min, unconfirmed.) The 30/min limiter is per process (useless across serverless instances) and never evicts keys (20,000 rotating `X-Forwarded-For` values grew RSS 178 -> 203 MB); with `CRYPTO_TRUST_PROXY=true` rotating the header bypasses the limit. | shared store or eviction; keep proxy trust off except on Vercel. | A4-6, A5-21 |
| BUG-038 | partial | C | `crypto-service/app/ratelimit.py` | Rate limits are keyed on the peer IP. Behind the bridge on loopback, uvicorn trusts `X-Forwarded-For` (so visitors are separate), but any loopback caller can spoof it (8 requests passed a 5/min limit) and the backend council client calls without a forwarded header (shared bucket: 5 OK then 429). The comment saying XFF is never trusted is wrong. | pass a trusted IP header from the bridge, set `--forwarded-allow-ips` deliberately. | A5-7 |
| BUG-039 | fixed | M | `council.py:188` | Council cache key omits `lang`: after a Hindi run an English request returns `cached:true` with the Hindi chain text. The cache is also unbounded and keyed by user-supplied wallet sets. | include `lang`; bound the cache. | A5-5 |
| BUG-040 | fixed | M | `components/statement/auditHash.ts:17` | `STATEMENT_PERIOD` hard-coded to "2026-09" (also attested on-chain) while today is 2026-10-29. | derive from the statement window. | A6-12 |
| BUG-041 | fixed | M | `StatementAnchorPanel.tsx:24`, `statement/page.tsx` | A fresh `data` object every render defeats `useMemo`, so SHA-256 over all transactions recomputes on every render. | stable props / memo on ids. | A6-13 |
| BUG-042 | partial | M | `CreditsPill`, `CreditsDrawer`, QR lib | Statically imported by NavShell so they ship in every app route. Every `(app)` route first-load JS is 1.26-1.83 MB uncompressed (`/dashboard` 1,825 KB, `/statement` 1,797 KB, landing 992 KB, login 722 KB). | `next/dynamic` the drawer. | A6-14 |
| BUG-043 | fixed | M | `security_router.py` `Screening.wallets` | No `max_length`: a 50 MB body of 50,000 wallets returned 200. | cap to ~20 items and ~100 chars each. | A5-6 |
| BUG-044 | fixed | C | `app/services/billing/crypto.py:153-169` | If the explorer returns a JSON dict instead of a list, or a confirmed tx without `block_height`, `GET /api/crypto-invoice/{id}` returns 500. | validate types, map to `UpstreamError`. | A5-8 |
| BUG-045 | fixed | C | `crypto.py:63,85-91` | BTC invoice slots can be exhausted: 400 cookie-less sessions x 5 invoices created 851 invoices and 1,149 x 409; a legitimate user then got 409 on all 5 attempts for 30 minutes (only 999 offsets, no limiter on the route). | per-IP limit on invoice creation; larger offset space. | A5-9 |
| BUG-046 | partial | C | `address.py:226-247` | Secret-guard bypasses: seed phrases pass when separated by ZWSP/LRM/RLO/U+2061, digits without punctuation (`1 abandon 2 ability`), `1-word`, `#1 word`, `/ \| _ :`; Cyrillic homoglyphs, Spanish BIP-39 words, space-separated hex byte pairs and a WIF with one space also pass. Invisible characters are deleted rather than treated as spaces. Impact is low (such input still fails with 400 `invalid_address`, is not echoed or logged). 64-hex transaction hashes are wrongly rejected as secrets. | treat invisibles as spaces; strip digits/punctuation between words. | A5-10 |
| BUG-047 | fixed | C | `validator.py` | Groundedness validator gaps: English text accepted as `hi` and Hindi as `en` (no script check, and the limitation sentence is auto-appended); "99th percentile" passes; number words, `O​FAC`, "Treasury/SDN", "extortion", "all clear / not risky" pass. (Correctly rejects invented numbers, 95%, fullwidth/Arabic-Indic digits, OFAC mention without hit, "is safe", wrong verdict word.) | add script check and the missing patterns. | A5-11 |
| BUG-048 | fixed | C | `pipeline.py:190-193` | The replay fallback is never cached: on an engine-down instance 3 identical checks of `DEMO-w00380` cost 3 credits (3 -> 0). | cache and charge once. | A5-12 |
| BUG-049 | partial | C | session handling | Every cookie-less `GET /api/credits` (no rate limit) creates a session with 3 credits: clearing cookies resets to 3 by design; the only brake is the per-IP check limit. | accepted risk; document, or tie to the limiter. | A5-13 |
| BUG-050 | fixed | P | `core/config.py:47` | `FINPILOT_DEMO_MODE` is dead config (defaults true, never read) yet the demo script sets it; demo access really comes from `is_public_user()` in `core/auth.py`. | remove or wire up. | A8-13 |
| BUG-051 | fixed | P | `backend/app/main.py:90` | The CORS regex `^http://(localhost\|127.0.0.1):\d+$` with `allow_credentials=True` is active in production: a probe with `Origin: http://localhost:9999` was echoed. Low exploitability (bearer-token auth). | enable only outside prod. | A8-10 |
| BUG-052 | partial | P | `frontend/package-lock.json` | Other advisories: `zod` < 4.6.6 (direct dependency; zod 4 is a major), `@grpc/grpc-js`, `ws`, `undici`, `@fastify/busboy`, `hardhat`/`solc` via `@ethereum-attestation-service/eas-sdk`; `firebase`, `inngest`, `rainbowkit` "fixes" are downgrades; wagmi/viem/@reown/walletconnect need a wagmi 3 major (lazy attestation chunk only). | `npm audit fix` without `--force`; consider dropping `eas-sdk`. | A8-8, A6 |
| BUG-053 | partial | P | no `LICENSE`; `README.md:19,378` | README claims MIT and links `LICENSE`, but the file does not exist (GitHub reports `license: null`); repo ships `focal/` and stock videos (17 MB mp4s) and `assets/` images of unknown licence. | add LICENSE or change the claim; remove unlicensed assets. | A8-14 |
| BUG-054 | fixed | M | `README.md`, `docs/CRYPTPILOT*.md`, `docs/GO_LIVE.md` | README/docs say the work is on the `cryptiq-merge` branch (already merged); README tree root is `hackmatrix/`; "no CORS setup needed" ignores the crypto-service; no mention that crypto data is private so a fresh clone cannot run Wallet Guard without `ARTIFACTS_REPO`; lists features removed that the API still serves. | edit docs. | A7-18, A8-17 |
| BUG-055 | partial | P | UI | Overstated security wording: "Tamper-proof logs", "Immutable Audit Vault" (`CommandPalette.tsx:180`, README, household page) and "cryptographic invitation security" for what are ordinary logs. | tone down. | A7-17 |
| BUG-056 | fixed | P | dashboard | The dashboard row is cramped at 1360 px with the sidebar open: "Groceries" clipped, the 126% bar overflows, the "Last month/This month" pill pokes past the My Income card, the dot grid is cut off. At 768 px the "126%" label overflows its bar (`BudgetRemainingCard.tsx`). Fine with the sidebar collapsed. | responsive grid. | A1-14, A2-20 |
| BUG-057 | partial | P | dashboard "Monthly spend" tooltip | Literal "[spent]" / "[month]" (and Hindi "[खर्च]") placeholders, "₹133, 760" with a space, low-contrast lime text; Western grouping ("₹133,760", "₹106,092/mo") where lakh grouping is expected. | fix the formatter template. | A1-15, A7-13..A7-15 |
| BUG-058 | fixed | P | header search | The "⌘ K" badge renders as a dark blob with unreadable glyphs and says ⌘ though the shortcut is Ctrl+K on Windows/Linux. | fix `kbd` style, platform-aware label. | A1-16 |
| BUG-059 | fixed | P | privacy eye | About 16 amount nodes stay visible with the eye on (e.g. "You also owe ₹3,18,500"). | mask all amounts. | A1-17 |
| BUG-060 | fixed | P | notification bell | 31 unread; a "new merchant" alert carries an "Adjust Budget" button; alerts dated 29 Oct 2026 describe 2025/early-2026 transactions. | rebase seed dates; fix actions. | A1-18 |
| BUG-061 | fixed | P | `/profile` | The last input ("How much do you want to save each month") is cut off by its container; all answers empty. | layout fix. | A1-20 |
| BUG-062 | partial | P | `/simulate` (Priya) | Defaults are hard-coded ("Monthly income ₹10,000", "Other expenses ₹3,500", 7 items at ₹4,167), not her data; "You save ₹0" next to "Savings over 12 months ₹27,996". | seed from the user's data. | A1-13 |
| BUG-063 | fixed | P | `/plan` | "Constraints and goal" inputs are blank with no placeholder; mixed money formats ("INR 73,745" vs "4,05,000" without a symbol). | placeholders, one formatter. | A1-21 |
| BUG-064 | fixed | M | Dashboard/Transactions text | Clipped "Employ…" and a clipped "Priya Credit Card - HDFC Regalia" select. | min-width. | A7-20 |
| BUG-065 | fixed | M | `lib/crypto/useWalletCheck.ts:63` | The key lowercases base58 addresses, which are case-sensitive, so a case-typo hits the cached verdict. | lowercase only `bc1` addresses. | A6-19 |
| BUG-066 | fixed | P | `pay/page.tsx` Scanner | Unmounting during the camera permission prompt leaves the camera on and the 250 ms interval running. | cancelled flag after the await. | A6-9 |
| BUG-067 | fixed | P | `lib/voice.ts` | No unmount cleanup for recognizer/timers; `ChatPopup` stays mounted on `/copilot` so two microphones can be active. | abort and clear timers. | A6-10 |
| BUG-068 | fixed | P | `evidence-room/page.tsx:255` | A slow response for the previous persona overwrites the new persona's report (eslint `set-state-in-effect`). | `useAsync`/live flag. | A6-11 |
| BUG-069 | partial | M | A2 | Accessibility polish: two `main` landmarks and non-unique landmarks on 50 pages (shadcn `SidebarInset` + `NavShell` `<main>`), `/login`, `/pay`, `/pay/qr` have no `main`, 864 nodes outside landmarks; no h1 on `/pay`, `/evidence-room`, `/my-data`, `/twin`; two h1 on `/statement`; heading-order skips on 22 pages; `/tax` and `/timeline` redirect to `/scenarios?tab=...` with one shared title/h1; 126 `label-content-name-mismatch` (e.g. aria-label "100 credits. Open credits" vs visible "100"); keyboard-unreachable scrolling tables on `/forecast-risk`, `/plan`, `/scenarios` at 390 px; `aria-valid-attr-value` on `/timeline` (missing id). | fix landmarks/headings/labels. | A2-14..A2-18, A2-21 |
| BUG-070 | partial | M/P | tap targets | Under 44 px: sidebar toggle 28, sidebar links 32, persona chips 28, credits pill 32, header icons ~36 (counts: dashboard 40, transactions 52, scenarios 34, simulate 30 at 360). | enlarge hit areas. | A2-19 |

---

# 4. P3

| ID | Status | Origin | Where | What | Source |
|---|---|---|---|---|---|
| BUG-071 | fixed | M | `CryptoInvoice.tsx` | "Expired" is derived from the client clock and stops polling; the countdown is wrong for a tab left open (reviewer: stale `now` at mount). Trust the server status. | A6-16 |
| BUG-072 | fixed | M | `useCredits.ts` | Activity log keyed by device, not user (a persona switch logs a fake "Wallet check"); each of three hook instances runs its own poller. | A6-17 |
| BUG-073 | fixed | M | `council/stream.ts` | Last NDJSON line without trailing newline is dropped; `JSON.parse` can throw; no abort; `lang` hard-coded "en"; API-base logic duplicates `lib/api.ts`. | A6-18 |
| BUG-074 | fixed | M | `useVoiceInput.ts` | A stale `onend`/`onstop` kills a newly started recording after cancel. | A6-20 |
| BUG-075 | fixed | M | `WalletGuardTile.tsx` | An invalid address on Enter shows no message (a seed phrase now shows the warning). | A6-21 |
| BUG-076 | fixed | P | `crypto/env.ts` | `??` does not catch empty strings: a blank `NEXT_PUBLIC_CHAIN_ID` gives chain 0; `CHAIN_ID` is also unused. | A6-24 |
| BUG-077 | open | P | `next.config.ts` | Rewrite destination and `NEXT_PUBLIC_*` are baked at build time; all URLs are root-relative so a sub-path deployment breaks. | A6-25 |
| BUG-078 | open | P | `firebase/config.ts:5` | Hard-coded fallback Firebase web config for project `hackmatrix-3764f` (public by design; restrict the key by referrer/API, enable App Check). | A8-9, A6-23 |
| BUG-079 | fixed | P | `backend/Dockerfile` | Runs as root. | A8-15 |
| BUG-080 | fixed | P | `webhooks_router.py:26`; FastAPI `:8000` | The Setu webhook logs 4 KB of an unauthenticated body when its secret is unset; `/docs`, `/openapi.json`, `/redoc` are open on `:8000` (404 at `:3100`). | A8-16 |
| BUG-081 | fixed | P | `.env.example` (root and crypto-service) | Root lacks NVIDIA_*, TAVILY, FIRECRAWL, NUGEN, INNGEST_*, PLAID_*, AA_*, SETU_*, FIRESTORE_*; `CRYPTO_SERVICE_URL` shows 8200 while the demo uses 8132; crypto-service's example lacks RATE_LIMIT_*, MAX_*, THRESHOLD_*, INVOICE_TTL_MINUTES, MAX_AUDIO_*. | A8-18 |
| BUG-082 | open | P | repo | `frontend/public/public/` is a full duplicate of public assets; workflow actions pinned to tags (`checkout@v3` deprecated). | A8-19 |
| BUG-083 | fixed | P | `core/auth.py` `_GUEST_ID` | Ends with `$`, so a guest id with a trailing newline is accepted (use `fullmatch`/`\Z`). From code reading. | A4-7 |
| BUG-084 | partial | P | `POST /api/security/{id}/investigate` | Takes 3.6-4.1 s for all personas; looks like deliberate pacing; confirm. | A4-8 |
| BUG-085 | fixed | C | webhooks | A signed body of `[]`, `{"data":"x"}` or non-dict `metadata` returns 500 (event rolled back so Dodo retries forever); 300-char webhook-id accepted on SQLite (`String(128)` would fail on Postgres). | A5-14, A5-15 |
| BUG-086 | fixed | C | `session.py` | The session cookie has no server-side expiry (HMAC without a timestamp). | A5-16 |
| BUG-087 | partial | C | `pipeline.py:139` | At 0 credits `/api/check` returns 402 even for cached, UNKNOWN and OFAC answers. | A5-17 |
| BUG-088 | fixed | C | `errors.py:42` | JSON parse errors leak the offset ("invalid request: 14"); `HEAD` returns 405 on `/api/health` and `/api/crypto/status`. | A5-18 |
| BUG-089 | fixed | C | `pipeline.py:209-210` | The result is cached before the charge: the loser of a credit race does the full LLM work, gets 402, and its result is cached for others. | A5-19 |
| BUG-090 | partial | C | webhooks | `payment.refunded` and dispute events are ignored, so credits are never revoked. | A5-20 |
| BUG-091 | fixed | C | `audio.py:229-236` | ffmpeg subprocess: no cap on concurrent processes, no memory/CPU limit; the timeout kills but does not await the process. | A5-22 |
| BUG-092 | partial | P | UI | Recharts "width(-1) and height(-1)" warnings (1-8 per page); nested `<a><button>` on the landing page; native file input on `/photos`; mixed date formats; Twin categories read "Rent Housing", "Emi Loan", "Investment Sip"; floating chat/mic buttons overlap content at the right edge; narrower offset column on /upload, /council, /profile, /photos, /plan. | A1-25..A1-27 |
| BUG-093 | not reproduced | P | `/security` (Arjun, Meera) | Network never goes idle (15 s `networkidle` timeout); Priya's `/photos` took 23 s once. Unconfirmed cause. | A1-28 |
| BUG-094 | open | P | dead code | ~150 unused exports; dead files: `shadcn/chart` 373 lines, `ProfileQuestionnaire` 371, `RecurringList` 141, `PhonePairCard` 67; unused deps `animejs`, `@tanstack/react-table`; duplicates (`framer-motion` + `motion`, `qrcode` + `qrcode.react`, two `extractAddress`, three SHA-256, two voice hooks, two API-base copies). | A6 |
| BUG-095 | open | M/P | i18n nits | `cat.Utilities` Marathi punctuation; `nav.Invoices` dead key; Copilot "deadlines and schemes" button; duplicate Gmail invoices connector; Hindi wording nits; seed merchant "Amaz0n"; Marathi not offered by the crypto service. | A7-21..A7-24 |
| BUG-096 | partial | P | eslint | 13 errors / 24 warnings: real defects are `set-state-in-effect` at `evidence-room:255`, `transactions:620`, `currency.tsx:96` and the `exhaustive-deps` warning at `transactions:643`; the rest are dead code (`ProfileQuestionnaire`, `RecurringList`) or style/false positives (`CommandPalette`, `use-mobile`, `sidebar.tsx:611`, `WeeklyCompare:37`, `TrackScene` `any`, `Confetti` `prefer-const`, unused imports). | A6 |

---

# 5. Ops note (not a code bug): TigerGraph Savanna workspace is suspended

`GET <TG_HOST>/restpp/echo` -> `500 Failed to start workspace`. The live crypto-service reported `engineOk: false` until it was switched to NetworkX. The app degrades gracefully (replay fallback for the demo wallets, `503 graph_unavailable` otherwise) but the TigerGraph badge/claims cannot be demonstrated until the owner resumes the workspace in the Savanna console (and checks the remaining free credits).

# 6. What the auditors verified as working (do not regress)

- All 25 app routes + 6 public pages return 200 for all three personas; no uncaught page errors; no hydration warnings; Ctrl+K command palette, sidebar collapse and More menu, persona/language/currency switching produce no console errors (A1).
- No live secrets in the working tree or full git history of any of the three repos; no `.env`, service-account JSON or key file was ever committed; no Elliptic++-derived data or model file is in the public repo; persona data is synthetic (A8).
- Crypto-service: credits never went negative and nothing was double-charged under concurrency (3 concurrent distinct wallets with 1 credit: 1x200 + 2x402; 5 concurrent same wallet: 1 charged, 4 cached); session forging attempts all failed to a new session; SSE aborts are cancelled, not charged, not cached; webhook replay/stale/future/tampered/wrong-secret events rejected, 12 concurrent identical deliveries credited once; admin endpoints reject bad tokens; the bridge allowlist held against every path-encoding trick tried; 413 limits held (A5).
- Backend sweep: 336 calls, 180 x 200, no unexpected 5xx other than BUG-002; the merge's connector/chain-analyst/bridge code has no crash path found (A4).
- Wallet Guard page: one h1, labelled input, `aria-live` help text, `role=alert` errors; Credits drawer is a named dialog with no focus escape (A2).
- `<html lang>` switches to hi/mr on every page; test-mode/testnet wording is present on the payment surfaces; no "mainnet" in the UI; no Google Pay/Agent Ops/Web Intel strings in UI text or Copilot chips (A7).

# 7. Not covered (gaps in this audit)

- A1: not every secondary button on every page was clicked; the mic button was not clicked; Arjun/Meera screenshots and Hindi/Marathi screenshots were not reviewed visually; SGD/AED currencies untried.
- A2: on-screen keyboard behaviour (headless), JS-driven (framer-motion) animations under reduced motion, dark mode (the app has no theme provider).
- A4: per-user isolation checks beyond reading the auth code, negative/huge/NaN/unicode input fuzzing, CSV upload hardening (5 MB / 20,000 rows / MIME), CORS and security-header probing, rate limiter under load.
- A5: the happy-path BTC payment detection, and how the frontend renders an UNKNOWN-only council.
- A6/A7: nothing rendered in a browser for A6 (static); A7 did not run a link checker or test USD formatting after a currency switch; Marathi screenshots only for `/wallet-guard`.
- Nothing was tested with real Dodo, Wispr, a wallet, a microphone, or on a deployed host.

# 8. A3: crypto flows (Wallet Guard, credits, attestation, Copilot, councils)

A3 drove the live app with Playwright and curl. Confirmed bugs that other auditors also found are folded into BUG-006 (deep-link auto-run), BUG-016 (bad-checksum wallet shown as
"service unreachable") and BUG-037/038 (shared rate-limit). New findings:

### BUG-101 [M] P1: the header credits pill goes stale after every uncached check — **[fixed]**
- **Repro:** new demo session, `/wallet-guard`, check 3 fresh addresses. The pill shows **100** while the real balance is 99, 98, 96 and the result card says "96 credits left". It corrects itself only after a reload (seen 3 times).
- **Root cause (verified in code):** `frontend/lib/crypto/useWalletCheck.ts:74` dispatches `cryptpilot:credits-updated`, but `lib/crypto/creditsEvents.ts:2` defines `CREDITS_CHANGED_EVENT = "cryptpilot:credits-changed"` and both `CreditsPill` and `useCredits` listen only for that one.
- **Fix:** dispatch `notifyCreditsChanged()` (the shared helper) instead of the ad-hoc event name.
- **Source:** A3-1.

### BUG-102 [M] P1: Copilot's secret guard misses space/hyphen-split keys; the text is sent to `POST /api/chat` — **[fixed]**
- **Repro:** in `/copilot` send `e9873d79 c6d87dc0 fb6a5778 633389f4 453213303da61f20bd67fc233aa33262` (a 64-hex key split with spaces or hyphens) or a WIF with a space in it. The full text is in the request body (confirmed in 2 runs).
  Contiguous hex, hex inside a sentence, 12/15/24-word seeds in every format tried, xprv and testnet WIF **were** blocked.
- **Cause (likely):** the guard in `lib/crypto/address/seedGuard.ts` only tests contiguous strings; which guard the Copilot page calls was not traced. (The service-side bypass list is BUG-046.)
- **Impact:** a private key reaches the third-party chat backend and its logs.
- **Fix:** normalise (strip spaces, hyphens, zero-width characters) before testing for 64-hex / WIF / extended keys, in both the client guard and `messageHasSecret`.
- **Source:** A3-7.

### BUG-103 [M] P2: Copilot mishandles two addresses and the prefilled wallet question — **[fixed]**
- **Observed:** "compare A and B" shows a card for A only; B is silently ignored and the reply says "I wasn't able to confidently match your question". The chip text "Is this wallet safe to pay?" with no address returned an irrelevant Netflix-cancellation recommendation (seen once).
- **Fix:** render one card per extracted address (cap at 3) and tell the user when more were ignored; add a wallet intent to the offline router.
- **Source:** A3-10.

### BUG-104 [M] P3: "Format looks valid" is shown for bad-checksum / wrong-length addresses — **[fixed]**
- **Observed:** a bad checksum and a 61-character taproot both show the green hint, then fail with 400 and "Check the address" after submit; the council wallet box also accepts bad-checksum addresses (the cause of the misleading "offline" in BUG-016).
- **Where:** `lib/crypto/address/validate.ts`. **Fix:** verify bech32/base58 checksums client-side before showing the green hint or adding a wallet.
- **Source:** A3-2.

### BUG-105 [M] P3: some pasted secrets and trailing invisible characters are handled badly — **[fixed]**
- **Observed:** a trailing U+200B is not trimmed so a valid address is rejected; a seed phrase containing a zero-width character or extra words, and a testnet WIF (`c...`), stay visible in the input. None was sent (Check stays disabled).
- **Source:** A3-3.

### BUG-106 [M] P3: the WARN demo chip is labelled "Borderline test-split wallet", not "Warn" — **[fixed]**
- **Where:** `components/crypto/guard/DemoChips.tsx` uses the wallet note as the label when it is 28 characters or fewer. **Source:** A3-4.

### BUG-107 [M] P3: layout nits on Wallet Guard — **[fixed]**
- **Observed:** nested `<main>` landmarks; the header title is cut to "Wallet Gua" at 1280 px; the "RANSOMWHERE" tile label overflows its tile (`/tmp/claude-0/audit/A3/block_full.png`, `hi.png`). **Source:** A3-5.

### BUG-108 [M] P3: inconsistent verify-hash messages — **[fixed]**
- **Observed:** on the statement, a hash without `0x` or `0xzz` says "Does not match"; the Wallet Guard verify box says "Not a hash". **Source:** A3-11.

### BUG-109 [M] P3: attestation panels show raw environment-variable names and keep "Connect wallet" enabled when signing is not configured — **[fixed]**
- **Observed:** `NEXT_PUBLIC_EAS_SCHEMA_UID` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` are shown to end users. **Fix:** hide env names behind a "for the site owner" disclosure and disable "Connect wallet" when real signing is unavailable. **Source:** A3-12.

### BUG-110 [M] P3: Credits page nits — **[fixed]**
- **Observed:** the "Cake Wallet (BTC testnet / XMR demo)" tab overflows at 1280 px (`cake.png`); `/credits/success` with no `?status=` claims "Thank you... came back from Dodo"; the Evidence Room shows "available right now. ." (double period). **Source:** A3-13.

## A3: checked and working

- API validation: bad checksum, mixed-case or short bech32, testnet addresses, emoji, SQL and HTML strings, spaces -> `400 invalid_address`; seeds in every format tried, 64-hex and WIF -> `400 secret_input`; empty and a 5000-char string -> 422.
- UI secret handling: seed, hex and WIF input is wiped and nothing is sent from the address fields.
- Double-click and six Enters send exactly one request and cost one credit; UNKNOWN is free; cached repeats are free; reload mid-check is not charged; **cancelling mid-check is charged**.
- Listen audio returns 200 `audio/mpeg`; Hindi tab, hop filter, list view, node drawer, Esc and copy work; "View GSQL" is absent because the engine is networkx (by design).
- Credits: card and BTC/XMR invoice return 503 with friendly messages; switching coin mid-request is clean; return pages correct with `?status=failed` and `?status=cancelled`.
- Attestation: simulated preview and hash verify work. Copilot: a single address gives an inline card; the mic reports "No microphone found."
- Councils: a BLOCK wallet gives High Risk 74 with "Do not send funds"; UNKNOWN abstains with the right wording; the UI caps at 5 wallets and dedupes; a seed in the wallet box is cleared; the API silently screens 5 of 6 wallets.
- Deep links: `?address=` alone only prefills; a seed in the URL is wiped.

## A3: not tested

0-credit behaviour and the 402 path (the credit drain was stopped at balance 28), the 429 UI, the dashboard Wallet Guard tile, the `/twin` fraud form with the wallet field, a new browser context getting its own 100 credits, Copilot language switching, and "service down" behaviour (from code only).
