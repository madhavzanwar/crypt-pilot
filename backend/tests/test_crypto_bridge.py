"""Tests for the CryptPilot bridge (app.crypto_bridge). No network, no Firestore emulator, no Firebase.

Run WITHOUT the repo's emulator-bound conftest (it exits the session when the Firestore emulator is down):

    cd backend && /tmp/claude-0/cp-venv/bin/python -m pytest --noconftest tests/test_crypto_bridge.py -q

(any venv with backend/requirements.txt + pytest works; the crypto service is replaced by httpx.MockTransport.)
"""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.crypto_bridge import client as bridge_client
from app.crypto_bridge import router as bridge_router
from app.crypto_bridge import upstream

SID = "cryptiq_sid=abc.def"


class Upstream:
    """Records every request the bridge makes to the (mocked) crypto service and answers with `handler`."""

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


def make(monkeypatch, handler=None) -> tuple[TestClient, Upstream]:
    up = Upstream(handler)
    monkeypatch.setattr(upstream, "_transport", httpx.MockTransport(up))
    upstream.reset_shared_client()
    app = FastAPI()
    app.include_router(bridge_router.router)
    return TestClient(app), up


# ---- allowlist ------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", [
    ("GET", "/api/crypto/admin/anything"),
    ("POST", "/api/crypto/admin/crypto-invoice/abc/mark-paid"),
    ("GET", "/api/crypto/admin"),
    ("GET", "/api/crypto/docs"),
    ("GET", "/api/crypto/openapi.json"),
    ("GET", "/api/crypto/check"),               # right path, wrong method
    ("POST", "/api/crypto/health"),
    ("GET", "/api/crypto/audio/..%2F..%2Fetc%2Fpasswd"),
    ("GET", "/api/crypto/audio/notahash.mp3"),
    ("GET", "/api/crypto/crypto-invoice/a/b"),
    ("GET", "/api/crypto/"),
    ("POST", "/api/crypto/benchmark/run"),      # admin-only on the service: the bridge never forwards the admin token
])
def test_not_allowlisted_is_404_and_never_reaches_service(monkeypatch, method, path):
    c, up = make(monkeypatch)
    r = c.request(method, path)
    assert r.status_code == 404
    assert r.json() == {"error": "not_found"}
    assert up.requests == []


@pytest.mark.parametrize("method,path,upstream_path", [
    ("GET", "health", "/api/health"),
    ("GET", "demo-wallets", "/api/demo-wallets"),
    ("POST", "check", "/api/check"),
    ("POST", "check/stream", "/api/check/stream"),
    ("GET", "credits", "/api/credits"),
    ("POST", "checkout", "/api/checkout"),
    ("POST", "crypto-invoice", "/api/crypto-invoice"),
    ("GET", "crypto-invoice/inv_123", "/api/crypto-invoice/inv_123"),
    ("POST", "transcribe", "/api/transcribe"),
    ("GET", "audio/" + "a" * 32 + ".mp3", "/api/audio/" + "a" * 32 + ".mp3"),
    ("GET", "benchmark", "/api/benchmark"),
    ("GET", "benchmark/job/j-1", "/api/benchmark/job/j-1"),
    ("POST", "webhooks/dodo", "/api/webhooks/dodo"),
])
def test_allowlisted_routes_map_to_service_api(monkeypatch, method, path, upstream_path):
    c, up = make(monkeypatch)
    r = c.request(method, f"/api/crypto/{path}", content=b"{}" if method == "POST" else None)
    assert r.status_code == 200
    assert [(q.method, q.url.path) for q in up.requests] == [(method, upstream_path)]


def test_status_code_and_json_body_pass_through_unchanged(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(402, json={"error": "no_credits"}))
    r = c.post("/api/crypto/check", json={"address": "x", "lang": "en"})
    assert r.status_code == 402 and r.json() == {"error": "no_credits"}
    c, _ = make(monkeypatch, lambda req: httpx.Response(503, json={"status": "error", "error": "graph_unavailable"}))
    r = c.post("/api/crypto/check", json={"address": "x", "lang": "en"})
    assert r.status_code == 503 and r.json()["error"] == "graph_unavailable"


def test_needs_no_finpilot_auth_header(monkeypatch):
    c, up = make(monkeypatch)
    assert c.get("/api/crypto/health").status_code == 200
    assert "authorization" not in up.requests[0].headers


def test_forwards_json_body_and_selected_headers_only(monkeypatch):
    c, up = make(monkeypatch)
    c.post("/api/crypto/check", json={"address": "1abc", "lang": "hi"},
           headers={"Authorization": "Bearer secret", "X-Admin-Token": "nope", "Accept-Language": "hi"})
    sent = up.requests[0]
    assert json.loads(sent.content) == {"address": "1abc", "lang": "hi"}
    assert sent.headers["content-type"].startswith("application/json")
    assert sent.headers["accept-language"] == "hi"
    assert "authorization" not in sent.headers and "x-admin-token" not in sent.headers


# ---- cookies --------------------------------------------------------------------------------------------------------

def test_only_session_cookie_is_forwarded(monkeypatch):
    c, up = make(monkeypatch)
    c.get("/api/crypto/credits", headers={"Cookie": f"finpilot_token=zzz; {SID}; other=1"})
    assert up.requests[0].headers["cookie"] == SID
    c.get("/api/crypto/credits", headers={"Cookie": "finpilot_token=zzz"})
    assert "cookie" not in up.requests[1].headers


def _cookie_handler(value):
    return lambda req: httpx.Response(200, json={}, headers={"set-cookie": value})


def test_set_cookie_secure_and_domain_stripped_on_plain_http(monkeypatch):
    c, _ = make(monkeypatch, _cookie_handler(
        "cryptiq_sid=abc.def; Domain=crypto.test; Max-Age=2592000; Path=/; SameSite=none; Secure; HttpOnly"))
    r = c.get("/api/crypto/credits")  # TestClient base_url is http://testserver
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("cryptiq_sid=abc.def")
    low = cookie.lower()
    assert "secure" not in low and "domain" not in low
    assert "httponly" in low and "path=/" in low and "samesite=lax" in low and "max-age=2592000" in low


def test_set_cookie_lax_kept_as_is_on_http(monkeypatch):
    c, _ = make(monkeypatch, _cookie_handler("cryptiq_sid=abc.def; Max-Age=60; HttpOnly; Path=/; SameSite=lax"))
    low = c.get("/api/crypto/credits").headers["set-cookie"].lower()
    assert "samesite=lax" in low and "httponly" in low and "path=/" in low and "secure" not in low


def test_secure_kept_on_https_but_domain_still_dropped(monkeypatch):
    c, _ = make(monkeypatch, _cookie_handler("cryptiq_sid=abc.def; Domain=crypto.test; Path=/; SameSite=None; Secure; HttpOnly"))
    low = c.get("https://testserver/api/crypto/credits").headers["set-cookie"].lower()
    assert "secure" in low and "domain" not in low and "samesite=none" in low


def test_service_does_not_leak_cookie_between_visitors(monkeypatch):
    """The bridge's shared httpx client must not store the service's cookies and replay them for other visitors."""
    c, up = make(monkeypatch, _cookie_handler("cryptiq_sid=visitor1.sig; Path=/; HttpOnly"))
    c.get("/api/crypto/credits")
    c.cookies.clear()  # a different visitor (the TestClient is the "browser" and would replay the cookie it was given)
    c.get("/api/crypto/credits")
    assert all("cookie" not in q.headers for q in up.requests)


def test_internal_headers_not_exposed(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(
        200, json={}, headers={"server": "uvicorn", "x-internal": "10.0.0.5", "connection": "keep-alive", "x-request-id": "r1"}))
    r = c.get("/api/crypto/health")
    assert "x-internal" not in r.headers and "10.0.0.5" not in str(r.headers)
    assert "crypto.test" not in str(r.headers)
    assert r.headers["x-request-id"] == "r1"


def test_x_forwarded_for_carries_visitor_ip(monkeypatch):
    c, up = make(monkeypatch)
    c.get("/api/crypto/health", headers={"X-Forwarded-For": "6.6.6.6"})
    assert up.requests[0].headers["x-forwarded-for"] == "testclient"  # spoofed value ignored without CRYPTO_TRUST_PROXY
    monkeypatch.setenv("CRYPTO_TRUST_PROXY", "true")
    c.get("/api/crypto/health", headers={"X-Forwarded-For": "203.0.113.9"})
    assert up.requests[1].headers["x-forwarded-for"] == "203.0.113.9"
    c.get("/api/crypto/health", headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.9"})  # spoofed first hop ignored
    assert up.requests[2].headers["x-forwarded-for"] == "203.0.113.9"


def test_rate_limit_keys_on_last_hop_not_spoofed_first(monkeypatch):
    monkeypatch.setenv("CRYPTO_TRUST_PROXY", "true")
    c, up = make(monkeypatch)
    codes = [c.post("/api/crypto/check", json={"address": "x", "lang": "en"},
                    headers={"X-Forwarded-For": f"9.9.9.{i}, 203.0.113.9"}).status_code for i in range(31)]
    assert codes[30] == 429
    r = c.post("/api/crypto/check", json={}, headers={"X-Forwarded-For": "203.0.113.10"})
    assert r.status_code == 200  # a different real client is unaffected


def test_429_has_retry_after(monkeypatch):
    c, _ = make(monkeypatch)
    for _ in range(30):
        c.post("/api/crypto/check", json={})
    r = c.post("/api/crypto/check", json={})
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1


def test_audio_range_and_conditional_headers_round_trip(monkeypatch):
    def h(req):
        assert req.headers["range"] == "bytes=0-9" and req.headers["if-none-match"] == '"e1"'
        return httpx.Response(206, content=b"0123456789", headers={
            "content-range": "bytes 0-9/200", "accept-ranges": "bytes", "etag": '"e1"', "content-type": "audio/mpeg"})
    c, _ = make(monkeypatch, h)
    r = c.get("/api/crypto/audio/" + "a" * 32 + ".mp3", headers={"Range": "bytes=0-9", "If-None-Match": '"e1"'})
    assert r.status_code == 206 and r.headers["content-range"] == "bytes 0-9/200"
    assert r.headers["accept-ranges"] == "bytes" and r.headers["etag"] == '"e1"' and r.content == b"0123456789"


def test_head_is_allowed_on_get_routes(monkeypatch):
    c, up = make(monkeypatch)
    assert c.head("/api/crypto/health").status_code == 200
    assert up.requests[0].method == "GET"
    assert c.head("/api/crypto/check").status_code == 404


def test_transcribe_timeout_45s_default_and_configurable(monkeypatch):
    c, up = make(monkeypatch)
    c.post("/api/crypto/transcribe", content=b"x")
    monkeypatch.setenv("CRYPTO_TRANSCRIBE_TIMEOUT", "70")
    c.post("/api/crypto/transcribe", content=b"x")
    assert [q.extensions["timeout"]["read"] for q in up.requests] == [45.0, 70.0]


def test_no_session_cookie_on_health_and_demo_wallets(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(200, json={}, headers={"set-cookie": "cryptiq_sid=a.b; Path=/"}))
    assert "set-cookie" not in c.get("/api/crypto/health").headers
    assert "set-cookie" not in c.get("/api/crypto/demo-wallets").headers
    assert "set-cookie" in c.get("/api/crypto/credits").headers


# ---- webhook --------------------------------------------------------------------------------------------------------

def test_webhook_forwards_raw_bytes_and_signature_headers_unchanged(monkeypatch):
    c, up = make(monkeypatch, lambda req: httpx.Response(200, json={"ok": True}))
    raw = b'{"type":"payment.succeeded",  "data":{"payment_id":"pay_1" , "x":"\xc3\xa9"}}\n'  # odd spacing/bytes on purpose
    hdrs = {"webhook-id": "msg_1", "webhook-signature": "v1,c2ln/+=", "webhook-timestamp": "1700000000",
            "content-type": "application/json", "Cookie": SID, "Authorization": "Bearer x"}
    r = c.post("/api/crypto/webhooks/dodo", content=raw, headers=hdrs)
    assert r.status_code == 200
    sent = up.requests[0]
    assert sent.content == raw
    assert sent.headers["webhook-id"] == "msg_1"
    assert sent.headers["webhook-signature"] == "v1,c2ln/+="
    assert sent.headers["webhook-timestamp"] == "1700000000"
    assert "cookie" not in sent.headers and "authorization" not in sent.headers


def test_webhook_rejection_passes_through(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(401, json={"error": "invalid_signature"}))
    r = c.post("/api/crypto/webhooks/dodo", content=b"{}")
    assert r.status_code == 401 and r.json() == {"error": "invalid_signature"}


def test_webhook_not_rate_limited(monkeypatch):
    c, _ = make(monkeypatch)
    assert all(c.post("/api/crypto/webhooks/dodo", content=b"{}").status_code == 200 for _ in range(40))


# ---- multipart / binary ---------------------------------------------------------------------------------------------

def test_transcribe_multipart_bytes_and_boundary_pass_through(monkeypatch):
    c, up = make(monkeypatch, lambda req: httpx.Response(200, json={"text": "hi", "address": None, "provider": "sarvam"}))
    audio = bytes(range(256)) * 4
    r = c.post("/api/crypto/transcribe", files={"audio": ("a.webm", audio, "audio/webm")}, data={"lang": "en"})
    assert r.status_code == 200 and r.json()["provider"] == "sarvam"
    sent = up.requests[0]
    assert audio in sent.content and b'name="lang"' in sent.content
    assert sent.headers["content-type"].startswith("multipart/form-data; boundary=")


def test_audio_binary_passthrough(monkeypatch):
    mp3 = b"ID3\x04\x00\x00" + bytes(range(256)) * 8
    c, _ = make(monkeypatch, lambda req: httpx.Response(200, content=mp3, headers={"content-type": "audio/mpeg", "cache-control": "public, max-age=86400"}))
    r = c.get("/api/crypto/audio/" + "0" * 32 + ".mp3")
    assert r.content == mp3 and r.headers["content-type"] == "audio/mpeg"
    assert r.headers["cache-control"] == "public, max-age=86400"


def test_oversized_body_rejected_413(monkeypatch):
    c, up = make(monkeypatch)
    r = c.post("/api/crypto/transcribe", content=b"x" * (6 * 1024 * 1024 + 1))
    assert r.status_code == 413 and r.json() == {"error": "request_too_large"}
    assert up.requests == []


# ---- SSE ------------------------------------------------------------------------------------------------------------

def test_sse_relay_yields_each_event_before_upstream_finishes():
    """Prove the relay is incremental: the 2nd event is only produced after the consumer has received the 1st."""
    async def scenario():
        got_first = asyncio.Event()
        order: list[str] = []

        class Gated(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"event: step\ndata: {}\n\n"
                await asyncio.wait_for(got_first.wait(), 2)  # deadlocks (-> TimeoutError) if the relay buffered everything
                order.append("second produced after first consumed")
                yield b"event: result\ndata: {}\n\n"

        resp = httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=Gated())
        out = []
        async for chunk in bridge_router._relay(resp):
            out.append(chunk)
            got_first.set()
        return out, order

    out, order = asyncio.run(scenario())
    assert len(out) == 2 and order


def test_sse_stream_passthrough_unbuffered(monkeypatch):
    events = [b'event: step\ndata: {"id":"validate","label":"Validating address"}\n\n',
              b'event: step\ndata: {"id":"graph","label":"Querying TigerGraph"}\n\n',
              b'event: result\ndata: {"status":"ok","verdict":"BLOCK"}\n\n']

    class Chunks(httpx.AsyncByteStream):
        async def __aiter__(self):
            for e in events:
                yield e

    c, up = make(monkeypatch, lambda req: httpx.Response(
        200, headers={"content-type": "text/event-stream", "cache-control": "no-cache", "set-cookie": "cryptiq_sid=n.s; Path=/; HttpOnly; SameSite=lax; Secure"},
        stream=Chunks()))
    with c.stream("POST", "/api/crypto/check/stream", json={"address": "1abc", "lang": "en"}, headers={"Cookie": SID}) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.headers["x-accel-buffering"] == "no"
        assert "secure" not in r.headers["set-cookie"].lower()
        chunks = list(r.iter_bytes())
    assert b"".join(chunks) == b"".join(events)
    assert up.requests[0].headers["cookie"] == SID


def test_sse_error_before_stream_passes_through(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(402, json={"error": "no_credits"}))
    r = c.post("/api/crypto/check/stream", json={"address": "x", "lang": "en"})
    assert r.status_code == 402 and r.json() == {"error": "no_credits"}


# ---- failures, timeouts, rate limit ---------------------------------------------------------------------------------

def test_unreachable_is_503(monkeypatch):
    def boom(req):
        raise httpx.ConnectError("refused", request=req)
    c, _ = make(monkeypatch, boom)
    r = c.get("/api/crypto/credits")
    assert r.status_code == 503 and r.json() == {"error": "crypto_service_unavailable"}
    assert "crypto.test" not in r.text


def test_connect_timeout_counts_as_unreachable_503(monkeypatch):
    def boom(req):
        raise httpx.ConnectTimeout("slow", request=req)
    c, _ = make(monkeypatch, boom)
    assert c.post("/api/crypto/check", json={"address": "x"}).status_code == 503


def test_read_timeout_is_504(monkeypatch):
    def slow(req):
        raise httpx.ReadTimeout("slow", request=req)
    c, _ = make(monkeypatch, slow)
    r = c.post("/api/crypto/check", json={"address": "x", "lang": "en"})
    assert r.status_code == 504 and r.json() == {"error": "crypto_service_timeout"}


def test_timeouts_15s_default_60s_for_check_and_no_post_retries(monkeypatch):
    c, up = make(monkeypatch)
    c.get("/api/crypto/credits")
    c.post("/api/crypto/check", json={"address": "x", "lang": "en"})
    c.post("/api/crypto/check/stream", json={"address": "x", "lang": "en"})
    reads = [q.extensions["timeout"]["read"] for q in up.requests]
    assert reads == [15.0, 60.0, 60.0]

    calls = {"n": 0}

    def fail(req):
        calls["n"] += 1
        raise httpx.ReadTimeout("slow", request=req)
    c, _ = make(monkeypatch, fail)
    c.post("/api/crypto/checkout", json={"packId": "p"})
    assert calls["n"] == 1


def test_disabled_when_service_url_empty(monkeypatch):
    c, up = make(monkeypatch)
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "")
    r = c.get("/api/crypto/health")
    assert r.status_code == 503 and r.json() == {"error": "crypto_service_unavailable"} and up.requests == []


def test_check_is_rate_limited_per_ip_with_error_shape(monkeypatch):
    c, up = make(monkeypatch)
    codes = [c.post("/api/crypto/check", json={"address": "x", "lang": "en"}).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429
    r = c.post("/api/crypto/check/stream", json={"address": "x", "lang": "en"})
    assert r.status_code == 429 and r.json() == {"error": "rate_limited"}
    assert c.get("/api/crypto/credits").status_code == 200  # only /check* is limited
    assert len(up.requests) == 31


# ---- /status --------------------------------------------------------------------------------------------------------

HEALTH = {"ok": True, "voiceProvider": "sarvam", "engine": "tigergraph", "engineOk": True, "modelLoaded": True,
          "llmConfigured": True, "ofacLoaded": True, "dataSource": "elliptic++"}


def test_status_reflects_service_health_and_is_cached_10s(monkeypatch):
    c, up = make(monkeypatch, lambda req: httpx.Response(200, json=HEALTH))
    body = c.get("/api/crypto/status").json()
    assert body["configured"] is True and body["reachable"] is True
    assert (body["engine"], body["dataSource"], body["voiceProvider"], body["llmConfigured"]) == ("tigergraph", "elliptic++", "sarvam", True)
    assert "crypto.test" not in json.dumps(body)
    c.get("/api/crypto/status")
    assert len(up.requests) == 1 and up.requests[0].url.path == "/api/health"
    bridge_router._status_cache = (bridge_router._status_cache[0] - 11, bridge_router._status_cache[1])  # expire
    c.get("/api/crypto/status")
    assert len(up.requests) == 2


def test_status_when_service_down_never_500(monkeypatch):
    def boom(req):
        raise httpx.ConnectError("refused", request=req)
    c, _ = make(monkeypatch, boom)
    r = c.get("/api/crypto/status")
    assert r.status_code == 200
    assert r.json() == {"configured": True, "reachable": False, "engine": None, "dataSource": None,
                        "voiceProvider": None, "llmConfigured": False}


def test_status_when_service_returns_garbage_or_500(monkeypatch):
    c, _ = make(monkeypatch, lambda req: httpx.Response(500, text="boom"))
    assert c.get("/api/crypto/status").json()["reachable"] is False
    bridge_router.reset_status_cache()
    c, _ = make(monkeypatch, lambda req: httpx.Response(200, text="<html>"))
    assert c.get("/api/crypto/status").json()["reachable"] is False


def test_status_not_configured(monkeypatch):
    c, up = make(monkeypatch)
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "")
    body = c.get("/api/crypto/status").json()
    assert body["configured"] is False and body["reachable"] is False and up.requests == []


# ---- check_wallet (used by the councils) -----------------------------------------------------------------------------

def run_check(monkeypatch, handler, *args, **kw):
    up = Upstream(handler)
    monkeypatch.setattr(upstream, "_transport", httpx.MockTransport(up))
    return asyncio.run(bridge_client.check_wallet(*args, **kw)), up


def test_check_wallet_returns_json_and_is_cookieless(monkeypatch):
    payload = {"status": "ok", "verdict": "BLOCK", "riskScore": 97}
    out, up = run_check(monkeypatch, lambda req: httpx.Response(200, json=payload, headers={"set-cookie": "cryptiq_sid=a.b; Path=/"}), "1abc", "hi")
    assert out == payload
    sent = up.requests[0]
    assert sent.method == "POST" and sent.url.path == "/api/check"
    assert json.loads(sent.content) == {"address": "1abc", "lang": "hi"}
    assert "cookie" not in sent.headers


@pytest.mark.parametrize("handler", [
    lambda req: httpx.Response(402, json={"error": "no_credits"}),
    lambda req: httpx.Response(503, json={"status": "error"}),
    lambda req: httpx.Response(200, text="not json"),
    lambda req: httpx.Response(200, json=["list"]),
    lambda req: (_ for _ in ()).throw(httpx.ConnectError("refused")),
    lambda req: (_ for _ in ()).throw(httpx.ReadTimeout("slow")),
    lambda req: (_ for _ in ()).throw(RuntimeError("anything at all")),
])
def test_check_wallet_never_raises(monkeypatch, handler):
    out, _ = run_check(monkeypatch, handler, "1abc")
    assert out is None


def test_check_wallet_none_when_not_configured_or_bad_input(monkeypatch):
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "")
    out, up = run_check(monkeypatch, lambda req: httpx.Response(200, json={}), "1abc")
    assert out is None and up.requests == []
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "http://crypto.test")
    out, up = run_check(monkeypatch, lambda req: httpx.Response(200, json={}), "   ")
    assert out is None and up.requests == []
    assert asyncio.run(bridge_client.check_wallet(None)) is None  # type: ignore[arg-type]


def test_check_wallet_real_unreachable_port_returns_none(monkeypatch):
    monkeypatch.setenv("CRYPTO_SERVICE_URL", "http://127.0.0.1:9")  # discard port: connection refused
    monkeypatch.setattr(upstream, "_transport", None)
    assert asyncio.run(bridge_client.check_wallet("1abc")) is None


# ---- wiring ---------------------------------------------------------------------------------------------------------

def test_router_is_included_in_finpilot_app():
    from app.main import app

    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/api/crypto/status" in paths and "/api/crypto/{path:path}" in paths


# ---- review fixes ----------------------------------------------------------------------------------------------------

def test_chunked_upload_without_content_length_is_bounded(monkeypatch):
    """A body sent with Transfer-Encoding: chunked has no Content-Length: it must be cut off, not buffered whole."""
    c, up = make(monkeypatch)
    big = (b"x" * 65536 for _ in range(int(bridge_router.MAX_BODY_BYTES / 65536) + 8))
    r = c.post("/api/crypto/transcribe", content=big)  # generator body => chunked, no Content-Length
    assert r.status_code == 413 and r.json() == {"error": "request_too_large"}
    assert up.requests == []


def test_secure_is_added_on_https_when_the_service_forgot_it(monkeypatch):
    c, _ = make(monkeypatch, _cookie_handler("cryptiq_sid=abc.def; Path=/; SameSite=Lax; HttpOnly"))
    assert "secure" in c.get("https://testserver/api/crypto/credits").headers["set-cookie"].lower()
    assert "secure" not in c.get("http://testserver/api/crypto/credits").headers["set-cookie"].lower()


def test_abusable_post_routes_are_rate_limited(monkeypatch):
    c, _ = make(monkeypatch)
    for path in ("transcribe", "checkout", "crypto-invoice"):
        route = bridge_router._match("POST", path)
        assert route is not None and route.limited, path


def test_interrupted_stream_is_reported_not_silently_closed(monkeypatch):
    def handler(req):
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"event: step\ndata: {}\n\n"
                raise httpx.ReadError("boom")
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=Broken())

    c, _ = make(monkeypatch, handler)
    r = c.post("/api/crypto/check/stream", json={"address": "x", "lang": "en"})
    assert b"crypto_service_interrupted" in r.content


def test_trust_proxy_defaults_on_only_on_vercel(monkeypatch):
    monkeypatch.delenv("CRYPTO_TRUST_PROXY", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert bridge_router._trust_proxy() is False
    monkeypatch.setenv("VERCEL", "1")
    assert bridge_router._trust_proxy() is True
    monkeypatch.setenv("CRYPTO_TRUST_PROXY", "false")
    assert bridge_router._trust_proxy() is False
