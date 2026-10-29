# Integration notes (round 2): decisions only

This file records decisions taken while fixing the audit (`bugs.md`). It contains no results. Final test and
verification results are added by the lead after integration.

## Repository hygiene

- **Restore round-1 deletions.** `assets/Video Project 2.mp4` and the `assets/**/__MACOSX/` files were deleted in round 1
  and are restored unchanged from `af2d5b2`. Nothing in `assets/` is deleted. Unlicensed or oversized media is a
  question for the owner, not an automatic clean-up.
- **`api-use-case.pdf` (BUG-009).** Removed from the working tree only. It stays in git history. Purging history
  (`git filter-repo` plus a force-push) rewrites every commit id and needs the owner's explicit approval; it was not done.
- **`focal/` and `frontend/public/public/`.** Report only, not deleted. `focal/` is an unrelated Vite app (154 tracked
  files); `frontend/public/public/` (31 tracked files) is a duplicate subset of `frontend/public/`. Removing either is
  the owner's decision.
- **Licence (BUG-053).** No licence is chosen. The README no longer claims MIT and says the licence is undecided; no
  `LICENSE` file is added.

## CI and deployment (BUG-010)

- **`ci.yml`** stays minimal and read-only: frontend `next typegen` then `tsc --noEmit` after `npm ci` (typegen is needed for the generated `LayoutProps` type), and `compileall` for the FinPilot
  API and crypto-service. No secrets, no deploy, no tests that need a database or network.
- **`deploy-vercel.yml`** is `workflow_dispatch` only, bound to a `production` environment (configure required
  reviewers in GitHub settings), and fails early with a clear message when the three Vercel secrets are missing. It no
  longer deploys on every push to `main`.
- **`deploy-gh-pages.yml`** is deleted: it built the unrelated `focal/` app. The existing Vercel setup is the only
  deployment path.

## Docs (BUG-054)

- The status table in `docs/CRYPTPILOT.md` separates three classes: measured in this repository, reported by an earlier
  session but not re-run, and never run. Numbers from the earlier Cryptiq project are not repeated as facts.
- TigerGraph Savanna was suspended during the audit, so docs no longer present it as the working default; the demo
  launchers already fall back to NetworkX when it is not configured.
- `docs/GO_LIVE.md` is a checklist, not a record: it now says none of its steps has been performed.

## Scripts

- `run_cryptpilot_demo.sh` parses `.env` as data instead of sourcing it as shell. Sourcing broke JSON values such as
  `PACKS_JSON` and executed arbitrary text. Behaviour now matches the PowerShell launcher (existing environment wins,
  one pair of outer quotes removed).
- `import-config.ps1` writes only an allowlist of paths; `vercel-env-push.ps1` skips values that point at localhost.
- PowerShell scripts could not be executed in the Linux sandbox (no `pwsh`); those edits are untested.

## Verification results (measured on `main` 62e1047, plus the changes below)

| Gate | Result |
|---|---|
| Backend `pytest tests` (`--noconftest`, no Firestore emulator) | 597 passed, 0 failed |
| crypto-service `pytest` | 268 passed, 3 skipped on 62e1047; 269 passed, 3 skipped with the credit-cap guard below |
| Frontend `next typegen` + `tsc --noEmit` | 0 errors |
| Frontend `eslint .` | 0 errors, 24 warnings |
| Frontend `next build` (Next 16.4.3, `BACKEND_URL` set) | passes, 37/37 static pages |

Not run on this tree: the Playwright browser scripts, a live backend/crypto smoke, Docker builds, Vercel, anything against real Dodo, Wispr, TigerGraph, a wallet or a microphone. (An independent branch of the same fixes was verified live with Playwright and curl; see the PR description.)

### Fixes added after integration

- **Free-credit cap (BUG-049).** `FREE_SESSIONS_PER_IP_PER_DAY` (default 25) counted every visitor behind the bridge as one IP unless `CRYPTO_TRUST_PROXY=true`, so the 26th new visitor of the day would have received 0 credits. The cap now applies only when the IP identifies a visitor: `CRYPTO_TRUST_PROXY=true`, or a public peer address. Verified live: 30 cookie-less visitors from a loopback peer all received 3 credits. **Set `CRYPTO_TRUST_PROXY=true` on the crypto-service wherever the bridge fronts it** to enable the cap.
- **API error text.** A non-JSON 4xx body (an HTML 404 page from a missing proxy rewrite) was shown verbatim in the UI; it now goes to the console and the user sees `API <path> failed: <status>`.
- **Production build needs `BACKEND_URL` at build time.** The `/api/*` rewrite is baked in; without it the app proxies nothing (in dev the rewrite defaults to `http://127.0.0.1:8000`).
