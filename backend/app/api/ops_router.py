"""Agent Ops: which keys exist (masked), how each key / model / agent is behaving, what the web agents searched,
and the chain of retries and fallbacks. Secrets never leave the process: only the env-var name (and, for the admin token holder only, the last 4 characters)."""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from app import telemetry
from app.core.guard import ops_access, probe_limiter
from app.core.ratelimit import client_ip
from app.security import ai_agents

router = APIRouter(prefix="/api/ops", tags=["ops"])

# env var -> (provider, what it is used for)
KEYS = {
    "NVIDIA_API_KEY": ("NVIDIA NIM", "Copilot chat + Evidence Council agents (default)"),
    "NVIDIA_EVIDENCE_API_KEY": ("NVIDIA NIM", "Evidence Council agents (overrides the default key when set)"),
    "NVIDIA_CHAT_API_KEY": ("NVIDIA NIM", "General chat, Risk Council personas, UI translation fallback"),
    "NVIDIA_VISION_API_KEY": ("NVIDIA NIM", "Receipt and photo reading"),
    "NVIDIA_SPEECH_API_KEY": ("NVIDIA NIM", "Speech"),
    "GEMINI_API_KEY": ("Google Gemini", "UI translation (first choice) and photo recognition"),
    "TAVILY_API_KEY": ("Tavily", "Web Intel page and the Web Checker agent"),
    "FIRECRAWL_API_KEY": ("Firecrawl", "Page scraping fallback"),
    "RESEND_API_KEY": ("Resend", "Email alerts"),
    "PLAID_SECRET": ("Plaid", "US / EU bank linking (sandbox)"),
    "INNGEST_EVENT_KEY": ("Inngest", "Background Evidence Council runs"),
}
# env var -> (url, how the secret is sent). Free read-only GETs only; keys with no safe test are reported from real usage.
_NVIDIA_MODELS = "https://integrate.api.nvidia.com/v1/models"
PROBES = {
    "NVIDIA_API_KEY": (_NVIDIA_MODELS, "bearer"),
    "NVIDIA_EVIDENCE_API_KEY": (_NVIDIA_MODELS, "bearer"),
    "NVIDIA_CHAT_API_KEY": (_NVIDIA_MODELS, "bearer"),
    "NVIDIA_VISION_API_KEY": (_NVIDIA_MODELS, "bearer"),
    "NVIDIA_SPEECH_API_KEY": (_NVIDIA_MODELS, "bearer"),
    "GEMINI_API_KEY": ("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", "x-goog-api-key"),
    "TAVILY_API_KEY": ("https://api.tavily.com/usage", "bearer"),
    "RESEND_API_KEY": ("https://api.resend.com/domains", "bearer"),
    "FIRECRAWL_API_KEY": ("https://api.firecrawl.dev/v1/team/credit-usage", "bearer"),
}
AGENT_TASKS = {
    "data_guardian": "Audit data quality; AI finds wrongly categorised merchants",
    "duplicate_detector": "Judge double-charge candidates",
    "fraud_hunter": "Judge unusually large payments",
    "merchant_verifier": "Content-safety check of merchant names",
    "subscription_sleuth": "Judge price rises and overlaps",
    "pattern_analyst": "Judge payment shapes (bursts, round one-offs)",
    "web_checker": "Search the web about risky merchants, then read the sources",
    "risk_scorer": "Calibrate the final score by at most 10 points",
    "verdict_writer": "Write the plain-language verdict and actions",
}


def _mask(v: str) -> str:
    return f"{v[:5]}…{v[-4:]}" if len(v) > 12 else "set"


def _status(env: str, stats: dict | None) -> str:
    if not os.getenv(env):
        return "not_set"
    if not stats:
        return "unused"
    return "working" if stats.get("last_ok") else "failing"


@router.post("/probe/{env}")
def probe(env: str, request: Request, admin: bool = Depends(ops_access)) -> dict:
    """Test one key right now with a free read-only request. The result is recorded like any other call."""
    if not admin:
        probe_limiter.check(client_ip(request))
    if env not in KEYS:
        raise HTTPException(404, "Unknown key")
    secret = os.getenv(env)
    if not secret:
        return {"env": env, "status": "not_set", "ms": None, "detail": "Not set in the environment"}
    if env not in PROBES:
        return {"env": env, "status": "untestable", "ms": None, "detail": "No free test endpoint; its health comes from real calls"}
    url, how = PROBES[env]
    headers = {"Authorization": f"Bearer {secret}"} if how == "bearer" else {how: secret}
    t = telemetry.Timer()
    try:
        r = httpx.get(url, headers=headers, timeout=10)
        ok, detail = r.status_code < 400, f"HTTP {r.status_code}"
    except httpx.HTTPError as exc:
        ok, detail = False, f"Unreachable: {type(exc).__name__}"
    telemetry.record(kind="call", provider=KEYS[env][0], key=env, model="key check", agent="key_probe", ok=ok, ms=t.ms, error=None if ok else detail)
    return {"env": env, "status": "working" if ok else "failing", "ms": t.ms, "detail": detail}


def _runs(ev: list[dict]) -> list[dict]:
    """Group events by run id (newest first): how many parts a request was split into and what each part did."""
    runs: dict[str, dict] = {}
    for e in reversed(ev):  # oldest first, so 'run' creates the entry before its stages
        rid = e.get("run")
        if not rid:
            continue
        r = runs.setdefault(rid, {"run": rid, "ts": e["ts"], "via": None, "parts": None, "stages": [], "calls": 0, "errors": 0, "fallbacks": 0, "cache_hits": 0, "tokens": 0, "ms": 0})
        k = e["kind"]
        if k == "run":
            r.update(via=e.get("via"), parts=e.get("parts"), ts=e["ts"])
        elif k == "stage":
            r["stages"].append({"agent": e.get("agent"), "step": e.get("step"), "ms": e.get("ms"), "findings": e.get("findings")})
        elif k == "call":
            r["calls"] += 1
            r["errors"] += 0 if e.get("ok") else 1
            r["tokens"] += e.get("tokens") or 0
            r["ms"] += e.get("ms") or 0
        elif k == "fallback":
            r["fallbacks"] += 1
        elif k == "cache":
            r["cache_hits"] += 1
    return sorted((r for r in runs.values() if r["via"] or r["stages"]), key=lambda r: r["ts"], reverse=True)[:8]


def _resilience(ev: list[dict]) -> dict:
    from app import translate
    from app.rag import index as rag_index
    waiting = len(rag_index._offline)
    embedded = sum(1 for v in rag_index._idx.values() if v["matrix"] is not None)
    on_disk = len(list(rag_index._CACHE.glob("*.npz"))) if rag_index._CACHE.exists() else 0
    return {
        "providers": [{"provider": p, "up": up} for p, up in sorted(telemetry.provider_state().items())],
        "caches": [
            {"name": "AI answers (agents)", "entries": len(ai_agents._cache), "note": f"The same question within {int(ai_agents._TTL // 60)} minutes is answered with 0 tokens, even offline"},
            {"name": "Translations", "entries": sum(len(v) for v in translate._cache.values()), "note": "Saved to disk: a string translated once is never requested again"},
            {"name": "Search index (RAG)", "entries": len(rag_index._idx), "note": f"{embedded} with embeddings, {waiting} waiting for the network, {on_disk} saved on disk"},
            {"name": "Telemetry log", "entries": len(telemetry.events(10_000)), "note": "Kept on disk, survives restarts"},
        ],
        "index_events": [e for e in ev if e["kind"] in ("index", "outage", "recovery")][:20],
        "behaviour": [
            {"layer": "AI agents", "offline": "The primary model fails or times out (12 s), the backup model is tried, then the agent keeps its plain rule result.", "back": "The next run uses the models again; questions already answered come from cache."},
            {"layer": "Chat search (RAG)", "offline": "Embeddings cannot be fetched, so answers use keyword search only. Nothing is lost.", "back": "The next question re-embeds the missing data in batches and saves it; logged as 'reindexed after outage'."},
            {"layer": "Translation", "offline": "Gemini, then NVIDIA, then the English text is shown. Cached strings still translate.", "back": "Missing strings are translated on the next page view and saved to disk."},
            {"layer": "Web checks", "offline": "The Web Checker reports it could not reach the web and the verdict is written without it.", "back": "The next Evidence Council run searches again."},
        ],
    }


@router.get("/overview")
def overview(admin: bool = Depends(ops_access)) -> dict:
    stats = telemetry.summary()
    by_key = {b["name"]: b for b in stats["by_key"]}
    by_agent = {b["name"]: b for b in stats["by_agent"]}
    keys = [{"env": env, "provider": prov, "use": use, "configured": bool(os.getenv(env)), "masked": (_mask(os.getenv(env, "")) if admin else "set") if os.getenv(env) else None,
             "stats": by_key.get(env), "status": _status(env, by_key.get(env)), "testable": env in PROBES} for env, (prov, use) in KEYS.items()]
    agents = [{"agent": a, "task": task, "model": ai_agents.MODELS.get(a), "backup": ai_agents.BACKUPS.get(a), "stats": by_agent.get(a)} for a, task in AGENT_TASKS.items()]
    ev = telemetry.events(300)
    if not admin:  # what users typed into web search is not public telemetry
        ev = [{k: v for k, v in e.items() if k != "query"} for e in ev]
    return {
        "keys": keys, "agents": agents, "models": stats["by_model"],
        "totals": {"tokens": stats["tokens"], "fallbacks": stats["fallbacks"], "cache_hits": stats["cache_hits"]},
        "searches": [e for e in ev if e.get("kind") == "search"][:25],
        "runs": _runs(telemetry.events(600)), "resilience": _resilience(ev),
        "events": ev[:120],
    }
