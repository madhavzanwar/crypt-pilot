#!/usr/bin/env bash
# Run ONLY the crypto-service on this machine and publish it through a free Cloudflare quick tunnel, so a hosted
# FinPilot API (Vercel / Render) can reach it. For the all-in-one local demo use run_cryptpilot_demo.sh instead.
#
#   scripts/run_crypto_service_laptop.sh          start service + tunnel, print the URL to use
#   scripts/run_crypto_service_laptop.sh stop     stop both (saved PIDs only)
#   scripts/run_crypto_service_laptop.sh status
#
# What it prints at the end is the value for CRYPTO_SERVICE_URL on the HOSTED FinPilot API (backend). The browser never
# talks to this URL: browser -> frontend (/api/*) -> FinPilot API bridge -> this tunnel -> crypto-service.
# Settings are read from the environment or an untracked .env in the repo root (parsed as KEY=value data, not executed).
# Needs: uv, cloudflared. Data/model: set ARTIFACTS_REPO + HF_TOKEN (private Hugging Face repo) or have crypto-service/data.
# The quick-tunnel URL changes on every start: update CRYPTO_SERVICE_URL on the API (and redeploy) when it does.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.demo-logs"
PORT="${CRYPTPILOT_CRYPTO_PORT:-8132}"
say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

kill_tree() {
  local pid="$1" child
  if command -v pgrep >/dev/null 2>&1; then for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done; fi
  kill "$pid" 2>/dev/null || true
}

stop_all() {
  for n in cloudflared crypto-service-laptop; do
    f="$LOGS/$n.pid"
    if [ -f "$f" ]; then
      pid="$(cat "$f")"
      if alive "$pid"; then kill_tree "$pid"; say "  $n: stopped (pid $pid)"; else say "  $n: not running"; fi
      rm -f "$f"
    else say "  $n: no PID file"; fi
  done
}

case "${1:-start}" in
  stop) stop_all; exit 0 ;;
  status)
    for n in cloudflared crypto-service-laptop; do
      f="$LOGS/$n.pid"; [ -f "$f" ] && alive "$(cat "$f")" && say "  $n: running (pid $(cat "$f"))" || say "  $n: not running"
    done
    [ -f "$LOGS/tunnel-url.txt" ] && say "  tunnel URL: $(cat "$LOGS/tunnel-url.txt")"
    exit 0 ;;
  start) ;;
  *) die "usage: $0 [start|stop|status]" ;;
esac

command -v uv >/dev/null 2>&1 || die "uv is required (https://docs.astral.sh/uv/)."
command -v cloudflared >/dev/null 2>&1 || die "cloudflared is required (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)."
mkdir -p "$LOGS"

if [ -f "$ROOT/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"; key="${key#export }"
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    case "$val" in \"*\") val="${val:1:${#val}-2}" ;; \'*\') val="${val:1:${#val}-2}" ;; esac
    [ -z "${!key:-}" ] && export "$key=$val"
  done <"$ROOT/.env"
fi

[ -f "$LOGS/crypto-service-laptop.pid" ] && alive "$(cat "$LOGS/crypto-service-laptop.pid")" && die "already running; use '$0 stop' first."
(exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && die "port $PORT is already in use."

if [ -n "${ARTIFACTS_REPO:-}" ]; then
  [ -n "${HF_TOKEN:-}" ] || say "WARNING: ARTIFACTS_REPO is set but HF_TOKEN is not; a private repo will be refused."
  say "[1/3] fetching data and model (log: .demo-logs/fetch-artifacts.log)"
  ( cd "$ROOT/crypto-service" && uv run python -m scripts.fetch_artifacts ) >"$LOGS/fetch-artifacts.log" 2>&1 \
    || say "WARNING: fetch_artifacts failed; see the log. Continuing with whatever is on disk."
elif [ ! -d "$ROOT/crypto-service/data/processed" ]; then
  say "WARNING: no ARTIFACTS_REPO and no crypto-service/data/processed: checks will not work."
fi

if [ -z "${GRAPH_ENGINE:-}" ]; then
  if [ -n "${TG_HOST:-}" ] && { [ -n "${TG_SECRET:-}" ] || [ -n "${TG_PASSWORD:-}" ]; }; then export GRAPH_ENGINE=tigergraph; else export GRAPH_ENGINE=networkx; fi
fi
# The bridge sets X-Forwarded-For itself, so the service must trust it for per-IP rate limits (one proxy hop).
export CRYPTO_TRUST_PROXY="${CRYPTO_TRUST_PROXY:-true}"
say "[2/3] crypto-service on 127.0.0.1:$PORT (graph engine: $GRAPH_ENGINE)"
( cd "$ROOT/crypto-service" && exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" ) >"$LOGS/crypto-service-laptop.log" 2>&1 &
echo $! >"$LOGS/crypto-service-laptop.pid"

ok=""
for _ in $(seq 1 90); do
  sleep 2
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >"$LOGS/health.json" 2>/dev/null; then ok=1; break; fi
  alive "$(cat "$LOGS/crypto-service-laptop.pid")" || die "crypto-service exited; see .demo-logs/crypto-service-laptop.log"
done
[ -n "$ok" ] || { stop_all; die "no answer on /api/health after 3 minutes; see .demo-logs/crypto-service-laptop.log"; }
say "  health: $(cat "$LOGS/health.json")"

say "[3/3] Cloudflare quick tunnel"
rm -f "$LOGS/tunnel-url.txt"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOGS/cloudflared.log" 2>&1 &
echo $! >"$LOGS/cloudflared.pid"
url=""
for _ in $(seq 1 30); do
  sleep 1
  url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/cloudflared.log" | head -1)"
  [ -n "$url" ] && break
done
[ -n "$url" ] || { stop_all; die "no tunnel URL after 30 s; see .demo-logs/cloudflared.log"; }
echo "$url" >"$LOGS/tunnel-url.txt"

cat <<MSG

Done. The tunnel is up (keep this machine awake; the URL changes on restart).

  CRYPTO_SERVICE_URL=$url

1) Set that on the hosted FinPilot API (Render: Environment; Vercel: project env) and redeploy / restart it.
   Also set CRYPTO_TRUST_PROXY=true on the API if its host (Render, Vercel) sets X-Forwarded-For itself.
   (This script already sets it for the crypto-service, which sits behind the API bridge.)
2) Check from anywhere:  curl $url/api/health
3) Dodo webhook (test mode): https://<your-hosted-API-or-site>/api/crypto/webhooks/dodo
   events: payment.succeeded, payment.refunded, refund.succeeded, dispute.accepted, dispute.lost
4) FRONTEND_URL (where Dodo returns the browser) must be your hosted site; set it in .env before starting.
Stop everything: scripts/run_crypto_service_laptop.sh stop
MSG
