"""Regression tests: free-grant cap, trusted client IP, cookie compare, webhook bodies, no cookies on public GETs."""

from __future__ import annotations

import hashlib
import time
from typing import Any

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import Settings
from app.ratelimit import resolve_client_ip
from app.services.billing.webhook_verify import sign
from tests.test_payments import SW_SECRET, client_with


def _req(xff: str | None, peer: str = "10.0.0.1") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET", "path": "/"})


def _settings(**kw: Any) -> Settings:
    return Settings(_env_file=None, app_env="test", **kw)  # type: ignore[call-arg]


def test_xff_ignored_unless_proxy_trusted() -> None:
    assert resolve_client_ip(_req("6.6.6.6"), _settings()) == "10.0.0.1"


def test_trusted_proxy_takes_last_hop_not_spoofable_first() -> None:
    s = _settings(trust_proxy=True)
    assert resolve_client_ip(_req("6.6.6.6, 203.0.113.9"), s) == "203.0.113.9"
    assert resolve_client_ip(_req("203.0.113.9"), s) == "203.0.113.9"
    assert resolve_client_ip(_req(None), s) == "10.0.0.1"
    assert resolve_client_ip(_req("1.1.1.1, 2.2.2.2, 3.3.3.3"), _settings(trust_proxy=True, trusted_proxy_hops=2)) == "2.2.2.2"


def test_trust_proxy_env_name(monkeypatch: Any) -> None:
    monkeypatch.setenv("CRYPTO_TRUST_PROXY", "true")
    assert Settings(_env_file=None).trust_proxy is True  # type: ignore[call-arg]


def test_free_grants_capped_per_ip_per_day(settings: Settings) -> None:
    c = client_with(settings, free_sessions_per_ip_per_day=2)
    balances = []
    for _ in range(4):
        c.cookies.clear()  # a cookie-less visitor
        balances.append(c.get("/api/credits").json()["balance"])
    # loopback peer without a trusted proxy does not identify a visitor: the cap is skipped (no shared bucket)
    assert balances == [3, 3, 3, 3]
    # a different client IP (via trusted proxy header) still gets its grant
    c2 = client_with(settings, free_sessions_per_ip_per_day=1, trust_proxy=True)
    for ip, want in (("1.1.1.1", 3), ("1.1.1.1", 0), ("2.2.2.2", 3)):
        c2.cookies.clear()
        assert c2.get("/api/credits", headers={"x-forwarded-for": ip}).json()["balance"] == want


def test_free_grant_cap_zero_means_unlimited(settings: Settings) -> None:
    c = client_with(settings, free_sessions_per_ip_per_day=0)
    for _ in range(5):
        c.cookies.clear()
        assert c.get("/api/credits").json()["balance"] == 3


def test_non_ascii_cookie_signature_is_invalid_not_500(client: TestClient) -> None:
    client.cookies.set("cryptiq_sid", "abc.é中", domain="testserver.local")
    r = client.get("/api/credits", headers={"cookie": "cryptiq_sid=abc.é中".encode()})
    assert r.status_code == 200 and "set-cookie" in r.headers


def test_non_ascii_webhook_signature_is_401_not_500(settings: Settings) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    ts = str(int(time.time()))
    r = c.post("/api/webhooks/dodo", content=b"{}", headers={
        "webhook-id": "m1", "webhook-timestamp": ts, "webhook-signature": "v1,éé".encode()})
    assert r.status_code == 401


def test_webhook_non_object_body_is_400(settings: Settings) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    for i, raw in enumerate((b"[]", b"null", b"123", b'"x"', b'{"type":"payment.succeeded","data":[1]}')):
        ts = int(time.time())
        r = c.post("/api/webhooks/dodo", content=raw, headers={
            "webhook-id": f"m{i}", "webhook-timestamp": str(ts), "webhook-signature": sign(SW_SECRET, f"m{i}", ts, raw)})
        # an unmatchable paid event is retryable (BUG-005): 503, never 200
        assert r.status_code == (503 if raw.startswith(b'{') else 400), (raw, r.status_code)


def test_no_session_cookie_on_health_and_demo_wallets(client: TestClient) -> None:
    for path in ("/api/health", "/api/demo-wallets"):
        assert "set-cookie" not in client.get(path).headers
    assert "set-cookie" in client.get("/api/credits").headers


def test_head_ok_and_audio_range_etag(client: TestClient, settings: Settings) -> None:
    assert client.head("/api/health").status_code == 200
    name = hashlib.md5(b"x").hexdigest() + ".mp3"
    d = settings.artifacts_dir / "audio"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_bytes(bytes(range(200)))
    r = client.get(f"/api/audio/{name}", headers={"range": "bytes=0-9"})
    assert r.status_code == 206 and r.headers["content-range"] == "bytes 0-9/200" and r.headers["accept-ranges"] == "bytes"
    full = client.get(f"/api/audio/{name}")
    assert client.get(f"/api/audio/{name}", headers={"if-none-match": full.headers["etag"]}).status_code == 304
    assert client.head(f"/api/audio/{name}").status_code == 200


def test_429_has_retry_after() -> None:
    from fastapi import FastAPI
    from slowapi.errors import RateLimitExceeded  # noqa: F401

    from app.errors import install_error_handlers
    from starlette.exceptions import HTTPException

    app = FastAPI()
    install_error_handlers(app)

    @app.get("/x")
    def x() -> None:
        raise HTTPException(429, "rate_limited")

    r = TestClient(app).get("/x")
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1
