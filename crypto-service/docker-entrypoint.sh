#!/bin/sh
# 1) optionally fetch data/artifacts from a private repo (free hosts have no persistent volume)
# 2) start the API on $PORT. A failed fetch is logged and the API still starts (health shows modelLoaded=false).
set -u
if [ -n "${ARTIFACTS_REPO:-}" ]; then
  python -m scripts.fetch_artifacts || echo "fetch_artifacts failed: starting without artifacts" >&2
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
