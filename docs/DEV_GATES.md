# Developer gates

Run these before opening a pull request. Numbers below are the last recorded baselines, not guarantees.

## Backend (FinPilot API)

```bash
cd backend
python -m pytest -p no:cacheprovider --noconftest -q tests
```

Baseline: 508 pass, 4 known pre-existing failures (household managed_member_lifecycle, plan demo_personas, rag dining_first, seed_realism arjun; tracked as BUG-034). Any new failure is a regression. Some tests use the Firestore emulator (see `ENVIRONMENT.md`).

## Crypto service

```bash
cd crypto-service
uv sync -q
make fixture        # only if data/fixture is missing; synthetic DEMO- addresses, not real risk data
uv run pytest -q
```

Baseline: 219 pass, 3 skipped. The real Elliptic++ data is private; set `ARTIFACTS_REPO` and `HF_TOKEN` to use it.

## Frontend

```bash
cd frontend
npm ci
npx tsc --noEmit    # 0 errors
npx eslint .        # 0 errors; do not add eslint-disable to get green
npx next build      # must pass
```

## Workflow YAML

```bash
python -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]"
```

## CI and deployment workflows

- `ci.yml` runs on push and pull requests.
- `deploy-vercel.yml` is manual (`workflow_dispatch`) and runs in the `production` environment. In GitHub Settings > Environments > production, add required reviewers so each deploy needs approval. It needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- `deploy-gh-pages.yml` is manual only and would publish the unrelated legacy `focal/` app. Leave GitHub Pages disabled unless that is intended.

## Rules of the road

No secrets, `.env`, dataset, model or artifact files in commits. Testnet and test mode only. Do not invent metrics: report only numbers from a real run, otherwise "not measured".
