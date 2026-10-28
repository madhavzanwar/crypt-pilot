#!/usr/bin/env bash
# CryptPilot local demo launcher (macOS / Linux).
#
#   scripts/run_cryptpilot_demo.sh            start everything (same as "start")
#   scripts/run_cryptpilot_demo.sh stop       stop what this script started
#   scripts/run_cryptpilot_demo.sh status     show which saved PIDs are alive
#
# Starts three processes in the background, each with its log under ./.demo-logs/ and its PID in a *.pid file there:
#   1. crypto-service (Cryptiq)   uv run uvicorn app.main:app            http://127.0.0.1:8132
#   2. FinPilot API               python -m uvicorn app.main:app         http://127.0.0.1:8000
#   3. frontend                   npm run dev -- -p 3100                 http://localhost:3100
#
# Keys and settings are NEVER written here. They are read from the environment, or from an untracked .env file in the
# repo root (sourced as shell: KEY=value lines). Names that matter are listed in docs/CRYPTPILOT_ARCHITECTURE.md.
# Data: the Elliptic++ data and model are not in git (no stated licence). If ARTIFACTS_REPO is set, they are fetched
# from that PRIVATE Hugging Face repo with crypto-service/scripts/fetch_artifacts.py using HF_TOKEN from the environment.
# Otherwise crypto-service/data and crypto-service/artifacts must already be on disk, or the service starts without a model.
#
# The FinPilot API also needs its usual Firestore setup (emulator or service-account credentials, see ENVIRONMENT.md).
# Stopping uses the saved PID files only (the process and its children); nothing is matched by name.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.demo-logs"
# Defaults are fixed; override only if those ports are taken (CRYPTPILOT_CRYPTO_PORT, CRYPTPILOT_API_PORT, CRYPTPILOT_WEB_PORT).
CRYPTO_PORT="${CRYPTPILOT_CRYPTO_PORT:-8132}"
API_PORT="${CRYPTPILOT_API_PORT:-8000}"
WEB_PORT="${CRYPTPILOT_WEB_PORT:-3100}"

say() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Kill a process and all of its descendants (uv and npm start children). Walks the tree via parent pids.
kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  if command -v pgrep >/dev/null 2>&1; then
    for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child" "$sig"; done
  fi
  kill "-$sig" "$pid" 2>/dev/null || true
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

stop_one() {
  local name="$1" file="$LOGS/$1.pid" pid
  if [ ! -f "$file" ]; then say "  $name: no PID file"; return; fi
  pid="$(cat "$file" 2>/dev/null || true)"
  if pid_alive "$pid"; then
    kill_tree "$pid" TERM
    for _ in 1 2 3 4 5 6 7 8 9 10; do pid_alive "$pid" || break; sleep 0.5; done
    if pid_alive "$pid"; then kill_tree "$pid" KILL; fi
    say "  $name: stopped (pid $pid)"
  else
    say "  $name: not running (stale pid $pid)"
  fi
  rm -f "$file"
}

do_stop() {
  say "Stopping CryptPilot demo processes saved in $LOGS ..."
  stop_one frontend
  stop_one finpilot-api
  stop_one crypto-service
}

do_status() {
  local name pid
  for name in crypto-service finpilot-api frontend; do
    pid="$(cat "$LOGS/$name.pid" 2>/dev/null || true)"
    if pid_alive "$pid"; then say "  $name: running (pid $pid)"; else say "  $name: not running"; fi
  done
}

wait_http() { # url seconds
  local url="$1" secs="$2" i
  command -v curl >/dev/null 2>&1 || return 2
  for ((i = 0; i < secs; i++)); do
    curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

start_bg() { # name dir command...   (runs in the background, logs to .demo-logs, saves the PID)
  local name="$1" dir="$2"; shift 2
  local existing
  existing="$(cat "$LOGS/$name.pid" 2>/dev/null || true)"
  if pid_alive "$existing"; then die "$name is already running (pid $existing). Run: $0 stop"; fi
  ( cd "$dir" && exec nohup "$@" >"$LOGS/$name.log" 2>&1 ) &
  echo $! >"$LOGS/$name.pid"
  say "  $name: started (pid $(cat "$LOGS/$name.pid")), log: .demo-logs/$name.log"
}

do_start() {
  mkdir -p "$LOGS"

  # Optional local .env (untracked). Variables already in the environment win.
  if [ -f "$ROOT/.env" ]; then
    say "Reading $ROOT/.env"
    set -a
    # shellcheck disable=SC1091
    . "$ROOT/.env"
    set +a
  fi

  command -v uv >/dev/null 2>&1 || die "uv is required for crypto-service (https://docs.astral.sh/uv/)."
  command -v npm >/dev/null 2>&1 || die "npm (Node.js) is required for the frontend."

  for p in "$CRYPTO_PORT" "$API_PORT" "$WEB_PORT"; do
    if port_busy "$p"; then
      local owner_known=""
      for f in "$LOGS"/*.pid; do [ -f "$f" ] && pid_alive "$(cat "$f")" && owner_known=1; done
      [ -n "$owner_known" ] || die "port $p is already in use by something else."
    fi
  done

  # ---- 1. crypto-service ---------------------------------------------------------------------------------------
  say "[1/3] crypto-service on :$CRYPTO_PORT"
  if [ -n "${ARTIFACTS_REPO:-}" ]; then
    if [ -z "${HF_TOKEN:-}" ]; then warn "ARTIFACTS_REPO is set but HF_TOKEN is not; a private repo will be refused."; fi
    say "  fetching data and artifacts from the private repo (log: .demo-logs/fetch-artifacts.log)"
    ( cd "$ROOT/crypto-service" && uv run python -m scripts.fetch_artifacts ) >"$LOGS/fetch-artifacts.log" 2>&1 \
      || warn "fetch_artifacts failed (see .demo-logs/fetch-artifacts.log); starting without fresh artifacts."
  elif [ ! -d "$ROOT/crypto-service/data/processed" ]; then
    warn "no ARTIFACTS_REPO and no crypto-service/data/processed: the service will start without data or a model (checks will not work)."
  fi

  # Graph engine: honour GRAPH_ENGINE if set; otherwise TigerGraph when it is configured, else the in-memory NetworkX engine
  # (about 2.6 GB of RAM, measured).
  if [ -z "${GRAPH_ENGINE:-}" ]; then
    if [ -n "${TG_HOST:-}" ] && { [ -n "${TG_SECRET:-}" ] || [ -n "${TG_PASSWORD:-}" ]; }; then
      export GRAPH_ENGINE=tigergraph
    else
      export GRAPH_ENGINE=networkx
    fi
  fi
  say "  graph engine: $GRAPH_ENGINE"
  # Where Dodo sends the browser back after checkout. Override FRONTEND_URL in the environment to change it.
  export FRONTEND_URL="${FRONTEND_URL:-http://localhost:$WEB_PORT}"
  export CORS_ORIGINS="${CORS_ORIGINS:-$FRONTEND_URL}"
  start_bg crypto-service "$ROOT/crypto-service" uv run uvicorn app.main:app --host 127.0.0.1 --port "$CRYPTO_PORT"

  # ---- 2. FinPilot API -----------------------------------------------------------------------------------------
  say "[2/3] FinPilot API on :$API_PORT"
  if [ -z "${FIRESTORE_EMULATOR_HOST:-}" ] && [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]; then
    warn "no Firestore setting in the environment (FIRESTORE_EMULATOR_HOST / GOOGLE_APPLICATION_CREDENTIALS). The API will only work if backend/.env or .env.local provides one."
  fi
  PY="python3"
  if [ -x "$ROOT/backend/.venv/bin/python" ]; then PY="$ROOT/backend/.venv/bin/python"; fi
  if ! "$PY" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    warn "$PY cannot import fastapi/uvicorn. Install the backend first: cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt"
  fi
  export CRYPTO_SERVICE_URL="http://127.0.0.1:$CRYPTO_PORT"
  export FINPILOT_DEMO_MODE=true
  start_bg finpilot-api "$ROOT/backend" "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT"

  # ---- 3. frontend ---------------------------------------------------------------------------------------------
  say "[3/3] frontend on :$WEB_PORT"
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    say "  installing frontend dependencies (log: .demo-logs/npm-install.log)"
    ( cd "$ROOT/frontend" && npm install ) >"$LOGS/npm-install.log" 2>&1 || die "npm install failed, see .demo-logs/npm-install.log"
  fi
  # The browser calls /api/crypto/* on its own origin; Next.js forwards /api/* to this URL (next.config.ts).
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:$API_PORT}"
  if [ "${CRYPTPILOT_WEB_MODE:-dev}" = "prod" ]; then
    # Production build: needed when the site is opened through a tunnel (the dev server blocks unknown hostnames).
    # BACKEND_URL is read at build time by next.config.ts (the /api/* forwarding).
    say "  building the frontend for production (log: .demo-logs/npm-build.log), about a minute ..."
    ( cd "$ROOT/frontend" && BACKEND_URL="$NEXT_PUBLIC_API_URL" NEXT_TELEMETRY_DISABLED=1 npm run build ) >"$LOGS/npm-build.log" 2>&1 \
      || die "npm run build failed, see .demo-logs/npm-build.log"
    start_bg frontend "$ROOT/frontend" env BACKEND_URL="$NEXT_PUBLIC_API_URL" npm run start -- -p "$WEB_PORT"
  else
    start_bg frontend "$ROOT/frontend" npm run dev -- -p "$WEB_PORT"
  fi

  # ---- wait for the crypto service, then print URLs ------------------------------------------------------------
  say ""
  say "Waiting for crypto-service health (the NetworkX engine needs about 30 s to load) ..."
  if wait_http "http://127.0.0.1:$CRYPTO_PORT/api/health" 120; then
    say "  crypto-service is answering."
  else
    warn "crypto-service did not answer in time (or curl is missing). Check .demo-logs/crypto-service.log"
  fi

  say ""
  say "CryptPilot demo is starting:"
  say "  Frontend         http://localhost:$WEB_PORT   (Wallet Guard: /wallet-guard, Credits: /credits)"
  say "  FinPilot API     http://127.0.0.1:$API_PORT/docs"
  say "  Crypto bridge    http://127.0.0.1:$API_PORT/api/crypto/status"
  say "  crypto-service   http://127.0.0.1:$CRYPTO_PORT/api/health"
  say "  Logs             $LOGS"
  say "Stop with:        $0 stop"
}

case "${1:-start}" in
  start) do_start ;;
  stop) do_stop ;;
  status) do_status ;;
  *) die "usage: $0 [start|stop|status]" ;;
esac
