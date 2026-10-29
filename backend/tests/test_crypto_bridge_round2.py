"""Round 2 bridge fixes (BUG-015 cookie, BUG-036 closed event loop, BUG-037 global ceiling).
Run: python -m pytest -p no:cacheprovider --noconftest -q tests/test_crypto_bridge_round2.py"""
from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.crypto_bridge import router as bridge_router
from app.crypto_bridge import upstream
from app.core.ratelimit import RateLimiter


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "http://crypto.test")
    monkeypatch.delenv("CRYPTO_TRUST_PROXY", raising=False)
    upstream.reset_shared_client()
    bridge_router.reset_status_cache()
    bridge_router.crypto_check_limiter._calls.clear()
    bridge_router.crypto_global_limiter._calls.clear()
    yield
    monkeypatch.setattr(upstream, "_transport", None)
    upstream.reset_shared_client()


def make(monkeypatch, handler):
    seen: list[httpx.Request] = []

    def wrapped(req):
        seen.append(req)
        return handler(req)

    monkeypatch.setattr(upstream, "_transport", httpx.MockTransport(wrapped))
    upstream.reset_shared_client()
    app = FastAPI()
    app.include_router(bridge_router.router)
    return TestClient(app), seen


OK = lambda req: httpx.Response(200, json={"ok": True})  # noqa: E731


@pytest.mark.parametrize("cookie", ["cryptiq_sid=abc.é", "cryptiq_sid=ab c.d", 'cryptiq_sid="x.y"',
                                    "cryptiq_sid=" + "a" * 500, "cryptiq_sid=日本.語"])
def test_invalid_session_cookie_is_dropped_not_500(monkeypatch, cookie):
    c, seen = make(monkeypatch, OK)
    r = c.get("/api/crypto/credits", headers={"Cookie": cookie.encode("utf-8")})
    assert r.status_code == 200, r.text
    assert "cookie" not in seen[0].headers


def test_valid_session_cookie_still_forwarded(monkeypatch):
    c, seen = make(monkeypatch, OK)
    sid = "cryptiq_sid=Ab-_9.0123abcdef"
    assert c.get("/api/crypto/credits", headers={"Cookie": sid}).status_code == 200
    assert seen[0].headers["cookie"] == sid


def test_non_ascii_forwarded_headers_are_dropped(monkeypatch):
    c, seen = make(monkeypatch, OK)
    r = c.get("/api/crypto/credits", headers={"accept-language": "hi-é".encode("latin-1"), "user-agent": "ok"})
    assert r.status_code == 200
    assert "accept-language" not in seen[0].headers and seen[0].headers["user-agent"] == "ok"


def test_closed_event_loop_error_rebuilds_client_and_retries(monkeypatch):
    calls = {"n": 0}
    real_send = httpx.AsyncClient.send

    async def flaky(self, request, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("Event loop is closed")
        return await real_send(self, request, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "send", flaky)
    c, seen = make(monkeypatch, OK)
    r = c.get("/api/crypto/credits")
    assert r.status_code == 200 and calls["n"] == 2


def test_unrelated_runtime_error_is_a_clean_500(monkeypatch):
    async def boom(self, request, **kw):
        raise RuntimeError("something else")

    monkeypatch.setattr(httpx.AsyncClient, "send", boom)
    c, _ = make(monkeypatch, OK)
    assert c.get("/api/crypto/credits").status_code == 500


def test_global_ceiling_bounds_rotating_forwarded_for(monkeypatch):
    monkeypatch.setenv("CRYPTO_TRUST_PROXY", "true")
    monkeypatch.setattr(bridge_router, "crypto_global_limiter", RateLimiter(max_calls=5, window_seconds=60))
    c, _ = make(monkeypatch, OK)
    codes = [c.post("/api/crypto/check", json={"address": "x"}, headers={"x-forwarded-for": f"10.0.0.{i}"}).status_code
             for i in range(8)]
    assert codes[:5] == [200] * 5 and codes[5:] == [429] * 3


def test_status_answers_head(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(200, json={"engine": "networkx"}))
    assert c.head("/api/crypto/status").status_code == 200
    assert c.get("/api/crypto/status").status_code == 200
