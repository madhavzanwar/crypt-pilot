"""Round 2 hardening: BUG-007/008/011/012/018/035/043/051/080/083 and the date-dependent BUG-034 history fix."""
from __future__ import annotations

import os
import subprocess
import sys
import uuid
from datetime import date, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import main, telemetry
from app.core import auth, ratelimit
from app.core.paths import writable_dir, writable_file
from app.main import app

client = TestClient(app)


# --- BUG-011 security headers ---------------------------------------------------------------------------------------


def test_security_headers_on_every_response():
    r = client.get("/api/health") if client.get("/api/health").status_code != 404 else client.get("/api/schemes")
    h = r.headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and h["referrer-policy"]
    assert "strict-transport-security" not in h  # plain http, not production
    s = client.get("/api/schemes", headers={"x-forwarded-proto": "https"})
    assert "max-age" in s.headers["strict-transport-security"]


# --- BUG-051 CORS ---------------------------------------------------------------------------------------------------


def test_cors_localhost_regex_is_dev_only():
    assert main.cors_settings({})[1] is not None  # dev default
    origins, regex = main.cors_settings({"ALLOWED_ORIGINS": "https://app.example.com"})
    assert origins == ["https://app.example.com"] and regex is None
    assert main.cors_settings({"ALLOWED_ORIGINS": "https://a.example", "ALLOW_LOCALHOST_CORS": "true"})[1] is not None


def test_cors_origin_not_echoed_when_allowed_origins_is_set():
    code = (
        "from fastapi.testclient import TestClient\nfrom app.main import app\n"
        "c=TestClient(app)\n"
        "r=c.get('/api/schemes',headers={'Origin':'http://localhost:9999'})\n"
        "print('ACAO=',r.headers.get('access-control-allow-origin'))\n"
        "r=c.get('/api/schemes',headers={'Origin':'https://app.example.com'})\n"
        "print('ACAO2=',r.headers.get('access-control-allow-origin'))\n"
    )
    env = {**os.environ, "ALLOWED_ORIGINS": "https://app.example.com", "ALLOW_LOCALHOST_CORS": ""}
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={**env, "PYTHONPATH": os.path.dirname(os.path.dirname(__file__))}, cwd=os.path.dirname(os.path.dirname(__file__)), timeout=120)
    assert "ACAO= None" in out.stdout and "ACAO2= https://app.example.com" in out.stdout, out.stdout + out.stderr


# --- BUG-080 prod closes /docs; webhook body is not logged -----------------------------------------------------------


def test_docs_are_open_in_dev_and_closed_in_production():
    code = ("from fastapi.testclient import TestClient\nfrom app.main import app\nc=TestClient(app)\n"
            "print([c.get(p).status_code for p in ('/docs','/openapi.json','/redoc')])\n")
    cwd = os.path.dirname(os.path.dirname(__file__))
    dev = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=cwd, timeout=120, env={**{k: v for k, v in os.environ.items() if k not in ("APP_ENV", "FINPILOT_ENV", "VERCEL_ENV")}, "PYTHONPATH": cwd})
    prod = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=cwd, timeout=120, env={**os.environ, "APP_ENV": "prod", "PYTHONPATH": cwd})
    assert "[200, 200, 200]" in dev.stdout, dev.stdout + dev.stderr
    assert "[404, 404, 404]" in prod.stdout, prod.stdout + prod.stderr


def test_unauthenticated_webhook_body_is_not_logged(monkeypatch, caplog):
    monkeypatch.delenv("SETU_STATUS_WEBHOOK_SECRET", raising=False)
    with caplog.at_level("WARNING", logger="finpilot.webhooks"):
        r = client.post("/api/webhooks/setu-status", content=b'{"attacker":"CANARY-12345"}')
    assert r.status_code == 200
    assert "CANARY-12345" not in caplog.text


# --- BUG-083 guest id ------------------------------------------------------------------------------------------------


def test_guest_id_with_trailing_newline_is_not_public():
    assert auth.is_public_user("guest-abcdefghijkl")
    assert not auth.is_public_user("guest-abcdefghijkl\n")


# --- BUG-007 ops overview ---------------------------------------------------------------------------------------------


def test_ops_overview_never_returns_search_queries(tmp_path, monkeypatch):
    monkeypatch.setattr(telemetry, "_FILE", tmp_path / "t.jsonl")
    telemetry.record(kind="search", agent="web_checker", op="search", query="SECRET-QUERY-XYZ", ok=True)
    body = client.get("/api/ops/overview")
    assert body.status_code == 200
    assert "SECRET-QUERY-XYZ" not in body.text
    assert all("query" not in s for s in body.json()["searches"])


# --- BUG-008 per-IP limits ---------------------------------------------------------------------------------------------


def test_chat_limit_is_per_ip_not_per_guest_id(monkeypatch):
    monkeypatch.setattr(ratelimit, "chat_ip_limiter", ratelimit.RateLimiter(3, 3600))
    import app.api.routes as routes
    monkeypatch.setattr(routes, "chat_ip_limiter", ratelimit.chat_ip_limiter)
    monkeypatch.setattr(routes, "copilot_answer", lambda *a, **k: {"answer": "x"})
    codes = []
    for _ in range(5):
        gid = "guest-" + uuid.uuid4().hex[:16]  # a fresh self-minted id every call
        codes.append(client.post("/api/chat", json={"user_id": gid, "message": "hi"}, headers={"x-forwarded-for": "9.9.9.9"}).status_code)
    assert codes[:3] != [429] * 3 and 429 in codes[3:]
    other = client.post("/api/chat", json={"user_id": "guest-" + uuid.uuid4().hex[:16], "message": "hi"}, headers={"x-forwarded-for": "8.8.8.8"})
    assert other.status_code != 429  # another address is unaffected


def test_voice_limit_is_per_ip(monkeypatch):
    import app.api.voice_router as vr
    monkeypatch.setattr(vr, "voice_ip_limiter", ratelimit.RateLimiter(2, 600))
    from app.copilot import nvidia
    monkeypatch.setattr(nvidia, "complete_json", lambda *a: {"say": "ok"})
    codes = [client.post("/api/voice/act", json={"text": "hello", "path": "/dashboard", "user_id": "guest-" + uuid.uuid4().hex[:16]},
                         headers={"x-forwarded-for": "7.7.7.7"}).status_code for _ in range(4)]
    assert 429 in codes[2:]


# --- BUG-043 wallets cap -----------------------------------------------------------------------------------------------


def test_screening_body_is_capped():
    big = client.post("/api/security/demo-meera/council", json={"wallets": ["DEMO-a%d" % i for i in range(50)]})
    assert big.status_code == 422
    long = client.post("/api/security/demo-meera/council", json={"wallets": ["x" * 5000]})
    assert long.status_code == 422


# --- BUG-018 / BUG-035 connectors ---------------------------------------------------------------------------------------


def test_dataset_only_connector_disconnect_keeps_the_ledger():
    from app.core import store
    from app.ingest.seed import seed_if_empty
    from app.models import TransactionRow

    uid = "guest-r2conn00000001"
    from app.api.connectors_router import _seed_from_persona
    _seed_from_persona(uid, "priya")
    before = len(store.query(TransactionRow, user_id=uid))
    assert before > 0
    try:
        assert client.post(f"/api/connectors/{uid}/bank/connect", json={}).status_code == 200
        assert client.delete(f"/api/connectors/{uid}/bank").status_code == 204
        assert len(store.query(TransactionRow, user_id=uid)) == before
    finally:
        from app.ingest.seed import _clear_user
        _clear_user(uid)


def test_retired_google_pay_cannot_be_connected_and_does_not_wipe():
    from app.core import store
    from app.api.connectors_router import _seed_from_persona
    from app.models import TransactionRow

    uid = "guest-r2conn00000002"
    _seed_from_persona(uid, "meera")
    before = len(store.query(TransactionRow, user_id=uid))
    try:
        r = client.post(f"/api/connectors/{uid}/google_pay/connect", json={"profile": "priya"})
        assert r.status_code == 410
        assert len(store.query(TransactionRow, user_id=uid)) == before
    finally:
        from app.ingest.seed import _clear_user
        _clear_user(uid)


# --- BUG-012 writable paths / body limit ---------------------------------------------------------------------------------


def test_cache_paths_fall_back_to_tmp_when_the_code_dir_is_read_only(tmp_path, monkeypatch):
    from app.core import paths

    monkeypatch.setattr(paths.os, "access", lambda p, mode: False)  # a read-only code directory (root ignores chmod)
    f = writable_file(tmp_path / ".telemetry.jsonl")
    d = writable_dir(tmp_path / "cache")
    assert f.parent == paths._tmp_root() and f.name == ".telemetry.jsonl"
    assert d == paths._tmp_root() / "cache" and d.is_dir()
    monkeypatch.undo()
    monkeypatch.setenv("VERCEL", "1")
    assert writable_file(tmp_path / "x.json").parent == paths._tmp_root()


def test_body_limit_rejects_oversized_declared_bodies(monkeypatch):
    monkeypatch.setenv("FINPILOT_MAX_BODY_BYTES", "1000")
    r = client.post("/api/chat", content=b"x" * 2000, headers={"content-type": "application/json"})
    assert r.status_code == 413
    monkeypatch.delenv("FINPILOT_MAX_BODY_BYTES")
    monkeypatch.setenv("VERCEL", "1")
    assert main._max_body_bytes() == 4 * 1024 * 1024


# --- BUG-034 history drops the current calendar month on any day ---------------------------------------------------------


@pytest.mark.parametrize("today", [date(2026, 10, 29), date(2026, 10, 31), date(2026, 11, 29), date(2027, 1, 29), date(2026, 6, 15)])
def test_monthly_flows_always_drops_the_current_month(monkeypatch, today):
    import app.plan.history as history

    class FakeDate(date):
        @classmethod
        def today(cls):
            return cls(today.year, today.month, today.day)

    monkeypatch.setattr(history, "date", FakeDate)
    start = (pd.Timestamp(today).replace(day=1) - pd.DateOffset(months=5))
    days = pd.date_range(start, pd.Timestamp(today))
    df = pd.DataFrame({"date": days, "amount": -100.0, "category": "dining"})
    df.loc[df["date"].dt.day == 1, ["amount", "category"]] = [50000.0, "income"]
    out = history.monthly_flows(df)
    assert today.strftime("%Y-%m") not in set(out["month"])
    assert len(out) == 5
