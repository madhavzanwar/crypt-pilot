"""Round-2 backend regressions: security headers, docs gating, CORS in production mode, rate limiting, webhook signing,
guest-id matching, ops query privacy, cache locations. Process-level settings (CORS, docs) are read at import time, so those
tests start a fresh interpreter with the environment under test."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.webhooks_router import router as setu_router
from app.core.auth import is_public_user
from app.core.ratelimit import RateLimiter, client_ip
from app.main import app

BACKEND = Path(__file__).resolve().parents[1]
client = TestClient(app)


def _fresh_app(env: dict[str, str], script: str) -> dict:
    """Run `script` (prints one JSON line) in a new interpreter with `env` applied on top of a clean CORS/docs environment."""
    base = {k: v for k, v in os.environ.items() if k not in ("ALLOWED_ORIGINS", "ALLOW_LOCALHOST_CORS", "VERCEL", "FINPILOT_ENABLE_DOCS")}
    out = subprocess.run([sys.executable, "-c", f"import sys; sys.path.insert(0, {str(BACKEND)!r})\n{script}"], cwd=BACKEND, capture_output=True, text=True, timeout=120,
                         env={**base, **env, "PYTHONPATH": str(BACKEND), "FINPILOT_DEMO_MODE": "true"})
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.strip().splitlines()[-1])


_CORS_SCRIPT = """
import json
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
def acao(origin):
    r = c.options("/api/schemes", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
    return r.headers.get("access-control-allow-origin")
print(json.dumps({"local": acao("http://localhost:9999"), "loopback": acao("http://127.0.0.1:3000"), "prod": acao("https://app.example.com"),
                  "evil": acao("https://evil.example.com"), "docs": app.docs_url, "openapi": app.openapi_url}))
"""


# --- BUG-051: CORS ----------------------------------------------------------------------------------------------
def test_cors_production_mode_trusts_only_configured_origins():
    r = _fresh_app({"ALLOWED_ORIGINS": "https://app.example.com"}, _CORS_SCRIPT)
    assert r["prod"] == "https://app.example.com"
    assert r["local"] is None and r["loopback"] is None and r["evil"] is None  # the localhost regex is off in prod


def test_cors_dev_mode_allows_localhost_only():
    r = _fresh_app({}, _CORS_SCRIPT)
    assert r["local"] == "http://localhost:9999" and r["loopback"] == "http://127.0.0.1:3000"
    assert r["evil"] is None and r["prod"] is None


def test_cors_localhost_can_be_re_enabled_explicitly_in_prod():
    r = _fresh_app({"ALLOWED_ORIGINS": "https://app.example.com", "ALLOW_LOCALHOST_CORS": "true"}, _CORS_SCRIPT)
    assert r["local"] == "http://localhost:9999" and r["evil"] is None


# --- BUG-080 / BUG-011: docs gating and security headers -----------------------------------------------------------
def test_docs_are_off_in_production_and_on_in_dev():
    assert _fresh_app({"ALLOWED_ORIGINS": "https://app.example.com"}, _CORS_SCRIPT)["docs"] is None
    assert _fresh_app({"ALLOWED_ORIGINS": "https://app.example.com", "FINPILOT_ENABLE_DOCS": "true"}, _CORS_SCRIPT)["docs"] == "/docs"
    assert _fresh_app({"VERCEL": "1"}, _CORS_SCRIPT)["openapi"] is None
    assert _fresh_app({}, _CORS_SCRIPT)["docs"] == "/docs"


def test_every_api_response_carries_security_headers():
    for r in (client.get("/api/schemes"), client.get("/api/ops/overview"), client.get("/no-such-route")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["referrer-policy"] == "no-referrer"
        assert "max-age" in r.headers["strict-transport-security"]
        assert "default-src 'none'" in r.headers["content-security-policy"]


def test_interactive_docs_are_not_locked_down_by_the_api_csp():
    r = client.get("/docs")
    if r.status_code == 200:  # docs are on in the dev test environment
        assert "content-security-policy" not in r.headers and r.headers["x-content-type-options"] == "nosniff"


# --- rate limiting (BUG-037 / BUG-038 backend side) ------------------------------------------------------------------
def test_limiter_blocks_the_n_plus_first_call_per_key_and_recovers():
    import time

    lim = RateLimiter(3, 0.25)
    for _ in range(3):
        lim.check("a")
    with pytest.raises(HTTPException) as e:
        lim.check("a")
    assert e.value.status_code == 429 and "Retry in" in e.value.detail
    lim.check("b")  # another client is unaffected
    time.sleep(0.3)
    lim.check("a")  # the window slid


def test_client_ip_uses_first_forwarded_hop_else_socket_peer():
    from types import SimpleNamespace

    req = SimpleNamespace(headers={"x-forwarded-for": "9.9.9.9, 10.0.0.1"}, client=SimpleNamespace(host="127.0.0.1"))
    assert client_ip(req) == "9.9.9.9"
    assert client_ip(SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))) == "127.0.0.1"
    assert client_ip(None) == "unknown"


def test_translate_429_hits_the_flooding_client_only(monkeypatch):
    monkeypatch.setattr("app.api.translate_router.translate_limiter", RateLimiter(2, 60))
    monkeypatch.setattr("app.api.translate_router.translate.translate", lambda lang, texts: {})
    post = lambda ip: client.post("/api/translate", json={"lang": "hi", "texts": ["x"]}, headers={"x-forwarded-for": ip}).status_code  # noqa: E731
    assert [post("7.7.7.7") for _ in range(4)] == [200, 200, 429, 429]
    assert post("8.8.8.8") == 200  # a different visitor has their own bucket


# --- BUG-085-style hardening of the Setu webhook (signing) --------------------------------------------------------------
_wh = FastAPI()
_wh.include_router(setu_router, prefix="/api")
wh = TestClient(_wh, raise_server_exceptions=False)
URL = "/api/webhooks/setu-status"


def _sig(secret: str, raw: bytes) -> str:
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


@pytest.mark.parametrize("raw", [b"[]", b'{"data":"x"}', b'{"metadata":"not-a-dict"}', b"\xff\xfe", b"", b"null"])
def test_signed_odd_bodies_never_500(monkeypatch, raw):
    monkeypatch.setenv("SETU_STATUS_WEBHOOK_SECRET", "s3cret")
    r = wh.post(URL, content=raw, headers={"x-instatus-webhook-signature": _sig("s3cret", raw)})
    assert r.status_code == 200


def test_tampered_body_and_non_ascii_signature_are_rejected_not_500(monkeypatch):
    monkeypatch.setenv("SETU_STATUS_WEBHOOK_SECRET", "s3cret")
    raw = b'{"incident":{"status":"INVESTIGATING"}}'
    good = _sig("s3cret", raw)
    assert wh.post(URL, content=raw, headers={"x-instatus-webhook-signature": good}).status_code == 200
    assert wh.post(URL, content=raw.replace(b"INVESTIGATING", b"RESOLVED"), headers={"x-instatus-webhook-signature": good}).status_code == 401
    assert wh.post(URL, content=raw, headers={"x-instatus-webhook-signature": good[:-1] + ("0" if good[-1] != "0" else "1")}).status_code == 401
    assert wh.post(URL, content=raw, headers={"x-instatus-webhook-signature": "é".encode("latin-1")}).status_code == 401
    assert wh.post(URL, content=raw, headers={"x-instatus-webhook-signature": ""}).status_code == 400


def test_unsigned_body_is_never_logged_when_no_secret(monkeypatch, caplog):
    monkeypatch.delenv("SETU_STATUS_WEBHOOK_SECRET", raising=False)
    with caplog.at_level("WARNING", logger="finpilot.webhooks"):
        assert wh.post(URL, content=b"FORGED-LOG-LINE-42").status_code == 200
    assert "FORGED-LOG-LINE-42" not in caplog.text and "ignored" in caplog.text


# --- BUG-083: guest id must match exactly ------------------------------------------------------------------------------------
@pytest.mark.parametrize("uid,ok", [("guest-abcdef123456", True), ("guest-abcdef123456\n", False), ("guest-abcdef123456\n\n", False),
                                    ("guest-short", False), ("guest-ABCDEF123456", False), ("demo-priya", True), ("demo-priya\n", False)])
def test_guest_id_matching_is_exact(uid, ok):
    assert is_public_user(uid) is ok


# --- BUG-007: what users searched for is not public telemetry ---------------------------------------------------------------
def test_ops_overview_hides_search_queries_from_non_admins(monkeypatch):
    from app import telemetry

    monkeypatch.delenv("OPS_ADMIN_TOKEN", raising=False)
    telemetry.record(kind="search", agent="web_checker", run="r1", op="search", query="my-private-search-term-xyz")
    body = client.get("/api/ops/overview")
    assert body.status_code == 200 and "my-private-search-term-xyz" not in body.text
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "adm")
    admin = client.get("/api/ops/overview", headers={"x-ops-token": "adm"})
    assert "my-private-search-term-xyz" in admin.text


# --- BUG-012: caches go to a writable directory on serverless -----------------------------------------------------------------
def test_cache_dir_moves_to_tmp_on_vercel(monkeypatch, tmp_path):
    from app.core.paths import writable_dir

    monkeypatch.delenv("FINPILOT_CACHE_DIR", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert writable_dir(tmp_path) == tmp_path
    monkeypatch.setenv("VERCEL", "1")
    assert writable_dir(tmp_path) != tmp_path and str(writable_dir(tmp_path)).startswith(("/tmp", os.sep))
    monkeypatch.setenv("FINPILOT_CACHE_DIR", str(tmp_path / "c"))
    assert writable_dir(Path("/ro")) == tmp_path / "c"


def test_warmup_can_be_skipped_with_env_flag(monkeypatch):
    """FINPILOT_SKIP_WARMUP=true must stop the CLIP/OCR warm-up thread (it OOM-kills a 512 MB host)."""
    import asyncio
    import threading

    from app import main as app_main

    started = []
    real_thread = threading.Thread

    class Spy(real_thread):
        def __init__(self, *a, target=None, **k):
            started.append(getattr(target, "__name__", ""))
            super().__init__(*a, target=(lambda: None), **k)

    monkeypatch.setattr(threading, "Thread", Spy)
    monkeypatch.delenv("VERCEL", raising=False)

    async def run():
        async with app_main.lifespan(app_main.app):
            pass

    monkeypatch.setenv("FINPILOT_SKIP_WARMUP", "true")
    asyncio.run(run())
    assert "_warm_models" not in started

    started.clear()
    monkeypatch.delenv("FINPILOT_SKIP_WARMUP")
    asyncio.run(run())
    assert "_warm_models" in started


def test_copilot_failure_reason_names_the_real_cause_without_leaking_bodies():
    from app.copilot.engine import failure_reason

    assert failure_reason(RuntimeError("NVIDIA 429: too many")) == ("it is busy right now", "NVIDIA HTTP 429, rate limited")
    why, detail = failure_reason(RuntimeError("NVIDIA 401: {\"detail\":\"Authorization failed secret-body\"}"))
    assert "rejected" in why and "401" in detail and "secret-body" not in detail
    assert failure_reason(RuntimeError("NVIDIA 404: no such model"))[1] == "NVIDIA HTTP 404, model not found"
    assert failure_reason(RuntimeError("NVIDIA 500: boom"))[1] == "NVIDIA HTTP 500"
    assert failure_reason(TimeoutError("The read operation timed out"))[0] == "it did not respond in time"
    assert failure_reason(None)[0] == "the AI service could not be used"


def test_store_health_reports_mode_without_credentials():
    from fastapi.testclient import TestClient

    from app.main import app

    r = TestClient(app).get("/api/health/store")
    assert r.status_code == 200
    j = r.json()
    assert set(j) == {"mode", "projectId", "ok", "error"} and j["mode"] in ("memory", "firestore")
    assert "private_key" not in r.text and "BEGIN" not in r.text


def test_finpilot_store_memory_ignores_firebase_credentials(monkeypatch):
    """FINPILOT_STORE=memory must keep Firestore untouched even when credentials are present (free-plan quota exhaustion)."""
    from app.core import store

    store._db.cache_clear()
    monkeypatch.setenv("FINPILOT_STORE", "memory")
    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_JSON", '{"type":"service_account","project_id":"x"}')
    try:
        assert store._db() is None
    finally:
        store._db.cache_clear()


def test_notifications_are_reused_until_the_store_changes(monkeypatch):
    """Notifications scan the whole ledger: a second call within the memo window must not rebuild, a write must."""
    from fastapi.testclient import TestClient

    from app.api import notifications_router as nr
    from app.main import app

    c = TestClient(app)
    calls = []
    real = nr._build_notifications
    monkeypatch.setattr(nr, "_build_notifications", lambda uid: (calls.append(uid), real(uid))[1])
    nr._memo.clear()
    a = c.get("/api/notifications/demo-meera").json()
    b = c.get("/api/notifications/demo-meera").json()
    assert a == b and len(calls) == 1
    from app.core import store
    store._bump("transactions")  # any store write invalidates
    c.get("/api/notifications/demo-meera")
    assert len(calls) == 2


def test_nvidia_timeouts_are_configurable_and_capped_on_serverless(monkeypatch):
    from app.copilot import nvidia

    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("NVIDIA_DEEP_TIMEOUT_S", raising=False)
    monkeypatch.delenv("NVIDIA_CHAT_TIMEOUT_S", raising=False)
    assert nvidia._timeout("deep") == 40.0 and nvidia._timeout("chat") == 30.0
    monkeypatch.setenv("NVIDIA_DEEP_TIMEOUT_S", "55")
    assert nvidia._timeout("deep") == 55.0
    monkeypatch.setenv("NVIDIA_DEEP_TIMEOUT_S", "junk")
    assert nvidia._timeout("deep") == 40.0
    monkeypatch.setenv("VERCEL", "1")
    assert nvidia._timeout("deep") == 12.0 and nvidia._timeout("chat") == 12.0


def test_copilot_failure_names_every_step(monkeypatch):
    from app.copilot import engine

    def boom(*a, **k):
        raise RuntimeError("NVIDIA 429: slow down")

    monkeypatch.setattr(engine.nvidia, "complete_json", boom)
    monkeypatch.setattr(engine.nvidia, "chat", lambda *a, **k: (_ for _ in ()).throw(TimeoutError("The read operation timed out")))
    from types import SimpleNamespace

    monkeypatch.setattr(engine, "get_settings", lambda: SimpleNamespace(has_nvidia=True, nvidia_chat_api_key="x", has_nugen=False))
    monkeypatch.setattr(engine, "_prefetch", lambda *a, **k: ([], None, []))
    r = engine.answer("demo-meera", "how much can I save each week?", model="auto")
    texts = " ".join(g.text for g in r.data_gaps)
    assert "deep:" in texts and "fast:" in texts
