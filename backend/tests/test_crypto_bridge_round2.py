"""Round-2 regression tests for the crypto bridge (agent A). No network: the service is an httpx.MockTransport."""
from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.crypto_bridge import client as bridge_client
from app.crypto_bridge import router as bridge_router
from app.crypto_bridge import upstream


class Up:
    def __init__(self, handler=None):
        self.requests: list[httpx.Request] = []
        self.handler = handler or (lambda req: httpx.Response(200, json={"ok": True}))

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.handler(request)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "http://crypto.test")
    monkeypatch.delenv("CRYPTO_TRUST_PROXY", raising=False)
    upstream.reset_shared_client()
    bridge_router.reset_status_cache()
    bridge_router.crypto_check_limiter._calls.clear()
    yield
    monkeypatch.setattr(upstream, "_transport", None)
    upstream.reset_shared_client()


def make(monkeypatch, handler=None) -> tuple[TestClient, Up]:
    up = Up(handler)
    monkeypatch.setattr(upstream, "_transport", httpx.MockTransport(up))
    upstream.reset_shared_client()
    app = FastAPI()
    app.include_router(bridge_router.router)
    return TestClient(app), up


# ---- BUG-015 ---------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("raw", ["cryptiq_sid=abc.é".encode(), "cryptiq_sid=abc.中文".encode(), b"cryptiq_sid=a\xffb",
                                 b'cryptiq_sid=a"b', b"cryptiq_sid=a\\b"])
def test_bug015_non_ascii_cookie_is_dropped_not_500(monkeypatch, raw):
    c, up = make(monkeypatch)
    r = c.get("/api/crypto/credits", headers={"cookie": raw})
    assert r.status_code == 200
    assert "cookie" not in up.requests[0].headers  # the service sees a cookie-less request => new session


def test_bug015_ascii_cookie_still_forwarded(monkeypatch):
    c, up = make(monkeypatch)
    assert c.get("/api/crypto/credits", headers={"cookie": "other=1; cryptiq_sid=abc.def0123"}).status_code == 200
    assert up.requests[0].headers["cookie"] == "cryptiq_sid=abc.def0123"
