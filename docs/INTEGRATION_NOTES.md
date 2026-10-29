# Integration notes: round 2 bug-fix pass

Scope: the 106 findings in `bugs.md` (status column added there). Work was done by parallel agents on separate branches
(crypto-service + bridge, FinPilot backend, crypto frontend, app/lib frontend, components, repo/docs), merged and re-verified.
Result: 72 fixed, 28 partial, 5 open, 1 not reproduced (see `bugs.md`).

## Real results (not estimates)

| Gate | Result |
|---|---|
| Backend `pytest tests` (no Firestore emulator, `--noconftest`) | 566 passed, 0 failed (baseline before the pass: 508 passed, 4 failed; the 4 were fixed, see BUG-034) |
| crypto-service `pytest` | 300 passed, 3 skipped (baseline 219 / 3) |
| Frontend `tsc --noEmit` | 0 errors |
| Frontend `eslint .` | 0 errors, 19 warnings (baseline: 13 errors, 24 warnings) |
| Frontend `next build` (Next 16.4.3, `BACKEND_URL` set) | passes |
| Browser checks (Playwright, production build) | smoke, storage-blocked, landmarks, csp-sweep (23 routes), review-queue, evidence-stale, scanner-cleanup, voice-cleanup, statement-hash-hi, privacy-eye pass. `landmarks` reports 2 `h1` on `/statement` (BUG-069, open). |
| Wallet Guard flow | `DEMO-w02271` BLOCK, `DEMO-w01391` ALLOW, `DEMO-notindataset` UNKNOWN on the synthetic fixture |
| Live API checks (own ports) | household insights 200; non-ASCII cookie 200 direct and through the bridge; unlinked-connector delete 404 and ledger kept; editor-invites-owner 403; 10 parallel pays of 60 against 100 gave 1 x 200 and 9 x 402; signed unmatched Dodo webhook 500 `unmatched_payment`, no ghost session; en/hi/en check cost one credit; spoofed `X-Forwarded-For` did not bypass the check limit |

Not measured: bundle sizes, Lighthouse, axe scores, speedup from the hash memo, anything on a deployed host.

## Verification limits (read before trusting "fixed")

- Everything ran on the **synthetic fixture** (`DEMO-` addresses), not the real Elliptic++ data, with the NetworkX engine. TigerGraph (Savanna) was suspended and never exercised.
- Dodo was tested with **locally signed** webhooks only; real payload shapes (`product_cart`, `total_amount`) are assumed from Dodo's documentation. No real checkout, BTC testnet payment, EAS attestation, Wispr call, wallet connection or microphone was used.
- Docker images were not built. Vercel was not built or deployed (BUG-012 size limit and `maxDuration` are unverified).
- The tax slabs (FY2025-26 new regime) were checked against the figures given in the task, not against the official notification (no internet in the sandbox); surcharge is not modelled.

## Decisions

- **Restored files:** `assets/Video Project 2.mp4` and the `__MACOSX` junk files, deleted in the first round, were restored. Nothing was deleted this round except `api-use-case.pdf` (real name and email; git history still contains it, a purge needs the owner's approval and a force-push).
- **CSP is Report-Only** (`next.config.ts`). An enforced CSP with `'unsafe-inline'` was never tested against wallet connect, Plaid, the Dodo redirect or Google sign-in. Exercise those, then switch to enforcing. The other security headers are enforced.
- **Free-credit cap (BUG-049/C-01):** at most `FREE_SESSIONS_PER_IP_PER_DAY` (default 25) new sessions per client IP per UTC day get the 3 free credits. The cap applies only when the IP identifies a visitor: `CRYPTO_TRUST_PROXY=true` (the bridge forwards the real client IP) or a public peer address. Behind the bridge without that flag every request arrives from loopback, so the cap is skipped. Found in the final verification: without this guard the 26th new visitor of the day would have got 0 credits. **Set `CRYPTO_TRUST_PROXY=true` on the crypto-service wherever the bridge fronts it** to enable the cap.
- **Rate limiter** keys on the real client IP (`--no-proxy-headers` on uvicorn; the bridge sets one `X-Forwarded-For` value itself; the service honours it only under `CRYPTO_TRUST_PROXY`).
- **BUG-005 (unmatched paid webhook):** stored in `payment_issues`, returns 500 so Dodo retries, never marks processed, never creates a session. Refunds/disputes are recorded as `needs_manual_review`; credits are not revoked automatically.
- **Evidence pacing (BUG-084):** the 0.35 s per-stage delay is deliberate (the UI step animation depends on it); it is now `FINPILOT_EVIDENCE_PACE`.
- **BUG-020:** household endpoints return `200 null` (was 404) for a user in no household; frontend types updated.
- **Production build needs `BACKEND_URL` at build time** (the `/api/*` rewrite is baked in); without it the app proxies nothing. In dev the rewrite defaults to `http://127.0.0.1:8000`.
- **Flaky test fixed:** `test_btc_invoice_paid_once` asserted an amount prefix that is wrong for offsets of 1000 sats or more (about 1 run in 8 failed under load); now 0 failures in 30 runs under CPU load.

## Needs the owner

TigerGraph Savanna resume, Dodo test keys + webhook + real product ids, Bitcoin testnet receive address, EAS schema registration + WalletConnect project id, Wispr key, a LICENSE choice, deciding on a git-history purge of `api-use-case.pdf`, adding required reviewers to the GitHub `production` environment, a real Vercel build, hosting the crypto-service.
