"""Browser -> FinPilot API -> crypto service (vendored Cryptiq backend).

The browser only ever talks to /api/crypto/*; this router forwards an explicit allowlist of public service routes
(never /api/admin/* or anything else) and answers /api/crypto/status itself. Visitors are anonymous cookie sessions
(`cryptiq_sid`), so these routes deliberately do NOT require FinPilot (Firebase) auth.
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any, AsyncIterator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.core.ratelimit import RateLimiter
from app.crypto_bridge import upstream
from app.crypto_bridge.upstream import CHECK_TIMEOUT, DEFAULT_TIMEOUT, log

router = APIRouter(prefix="/api/crypto", tags=["crypto"])

SESSION_COOKIE = "cryptiq_sid"
MAX_BODY_BYTES = 6 * 1024 * 1024  # same ceiling as the crypto service (413 request_too_large)
STATUS_TTL_SECONDS = 10.0
STATUS_TIMEOUT_SECONDS = 3.0

# 30 wallet checks per minute per visitor IP (in-memory, same limiter FinPilot uses elsewhere).
crypto_check_limiter = RateLimiter(max_calls=30, window_seconds=60)

_ID = r"[A-Za-z0-9_-]{1,64}"


@dataclass(frozen=True)
class Route:
    method: str
    pattern: re.Pattern[str]
    timeout: float = DEFAULT_TIMEOUT
    limited: bool = False       # counts against crypto_check_limiter
    cookies: bool = True        # forward the visitor's session cookie / return Set-Cookie
    webhook: bool = False       # forward the signature headers byte-for-byte


def _r(method: str, regex: str, **kw: Any) -> Route:
    return Route(method, re.compile(regex), **kw)


# The ONLY thing that can be proxied. Paths are matched with fullmatch relative to /api/crypto/.
ALLOWLIST: tuple[Route, ...] = (
    _r("GET", r"health"),
    _r("GET", r"demo-wallets"),
    _r("POST", r"check", timeout=CHECK_TIMEOUT, limited=True),
    _r("POST", r"check/stream", timeout=CHECK_TIMEOUT, limited=True),
    _r("GET", r"credits"),
    _r("POST", r"checkout"),
    _r("POST", r"crypto-invoice"),
    _r("GET", rf"crypto-invoice/{_ID}"),
    _r("POST", r"transcribe"),
    _r("GET", r"audio/[0-9a-f]{32}\.mp3"),
    _r("GET", r"benchmark"),
    _r("POST", r"benchmark/run"),
    _r("GET", rf"benchmark/job/{_ID}"),
    _r("POST", r"webhooks/dodo", cookies=False, webhook=True),
)

# Request headers copied to the service (everything else, incl. Authorization and FinPilot cookies, is dropped).
_FORWARD_REQUEST_HEADERS = ("content-type", "accept", "accept-language", "user-agent", "x-request-id")
_WEBHOOK_HEADERS = ("webhook-id", "webhook-signature", "webhook-timestamp")
# Response headers copied back to the browser (plus a rewritten Set-Cookie). Anything else stays internal.
_FORWARD_RESPONSE_HEADERS = ("content-type", "cache-control", "content-disposition", "retry-after", "x-request-id", "etag", "last-modified")
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
    "transfer-encoding", "upgrade", "content-length", "content-encoding",
}


def _err(status: int, code: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code})


def _trust_proxy() -> bool:
    return os.environ.get("CRYPTO_TRUST_PROXY", "").lower() in ("1", "true", "yes")


def _peer(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _client_ip(request: Request) -> str:
    """Visitor IP used for rate limiting. X-Forwarded-For is only believed behind a trusted proxy."""
    if _trust_proxy():
        first = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if first:
            return first
    return _peer(request)


def _forwarded_for(request: Request) -> str:
    chain = request.headers.get("x-forwarded-for", "").strip() if _trust_proxy() else ""
    peer = _peer(request)
    return f"{chain}, {peer}" if chain else peer


def _is_plain_http(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower() if _trust_proxy() else ""
    return (proto or request.url.scheme) == "http"


def _session_cookie_header(request: Request) -> str | None:
    """Only the crypto session cookie is forwarded; the browser's other cookies are none of the service's business."""
    for part in request.headers.get("cookie", "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == SESSION_COOKIE and value:
            return f"{SESSION_COOKIE}={value}"
    return None


def rewrite_set_cookie(value: str, plain_http: bool) -> str:
    """Make an upstream Set-Cookie valid for the FinPilot origin: never a Domain; on plain http no Secure either."""
    parts = [p.strip() for p in value.split(";")]
    out = [parts[0]]
    for attr in parts[1:]:
        name = attr.split("=", 1)[0].strip().lower()
        if name == "domain":
            continue
        if plain_http and name == "secure":
            continue
        if plain_http and name == "samesite" and attr.split("=", 1)[-1].strip().lower() == "none":
            out.append("SameSite=Lax")  # SameSite=None without Secure is rejected by browsers
            continue
        out.append(attr)
    return "; ".join(out)


def _match(method: str, path: str) -> Route | None:
    for route in ALLOWLIST:
        if route.method == method and route.pattern.fullmatch(path):
            return route
    return None


def _build_response(resp: httpx.Response, body: bytes | None, route: Route, plain_http: bool) -> Response:
    headers = {k: resp.headers[k] for k in _FORWARD_RESPONSE_HEADERS if k in resp.headers}
    if body is not None:
        out: Response = Response(content=body, status_code=resp.status_code, headers=headers)
    else:
        headers.setdefault("cache-control", "no-cache")
        headers["x-accel-buffering"] = "no"  # keep nginx-style proxies from buffering the event stream
        out = StreamingResponse(_relay(resp), status_code=resp.status_code, headers=headers)
    if route.cookies:
        for cookie in resp.headers.get_list("set-cookie"):
            out.headers.append("set-cookie", rewrite_set_cookie(cookie, plain_http))
    return out


async def _relay(resp: httpx.Response) -> AsyncIterator[bytes]:
    """Pass the upstream body through chunk by chunk (no buffering); always release the upstream connection."""
    try:
        async for chunk in resp.aiter_raw():
            yield chunk
    except httpx.HTTPError as exc:
        log.warning("crypto stream interrupted: %s", upstream.error_summary(exc))
    finally:
        await resp.aclose()


async def _proxy(request: Request, path: str) -> Response:
    route = _match(request.method, path)
    if route is None:
        return _err(404, "not_found")
    if not upstream.is_configured():
        return _err(503, "crypto_service_unavailable")

    if route.limited:
        try:
            crypto_check_limiter.check(_client_ip(request))
        except Exception:  # HTTPException(429) from the shared limiter -> the {"error": ...} shape the frontend parses
            return _err(429, "rate_limited")

    body: bytes | None = None
    if request.method == "POST":
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            return _err(413, "request_too_large")
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            return _err(413, "request_too_large")

    headers = {"accept-encoding": "identity", "x-forwarded-for": _forwarded_for(request)}
    for name in _FORWARD_REQUEST_HEADERS:
        if name in request.headers:
            headers[name] = request.headers[name]
    if route.webhook:
        for name in _WEBHOOK_HEADERS:
            if name in request.headers:
                headers[name] = request.headers[name]
    if route.cookies:
        cookie = _session_cookie_header(request)
        if cookie:
            headers["cookie"] = cookie

    client = upstream.shared_client()
    upstream_req = client.build_request(
        request.method, f"/api/{path}", headers=headers, content=body, timeout=upstream.timeout_for(route.timeout)
    )
    started = time.perf_counter()
    try:
        resp = await client.send(upstream_req, stream=True)
    except httpx.ConnectTimeout:
        return _unreachable(path, "connect timeout")
    except httpx.TimeoutException as exc:
        log.warning("crypto %s %s timed out (%s)", request.method, path, upstream.error_summary(exc))
        return _err(504, "crypto_service_timeout")
    except httpx.HTTPError as exc:
        return _unreachable(path, upstream.error_summary(exc))

    plain_http = _is_plain_http(request)
    is_sse = resp.headers.get("content-type", "").lower().startswith("text/event-stream")
    try:
        if is_sse:
            out = _build_response(resp, None, route, plain_http)  # _relay closes resp
        else:
            try:
                data = await resp.aread()
            except httpx.TimeoutException:
                return _err(504, "crypto_service_timeout")
            except httpx.HTTPError as exc:
                return _unreachable(path, upstream.error_summary(exc))
            finally:
                await resp.aclose()
            out = _build_response(resp, data, route, plain_http)
    except Exception:
        await resp.aclose()
        raise
    log.info("crypto %s /%s -> %s (%d ms)", request.method, path, resp.status_code, int((time.perf_counter() - started) * 1000))
    return out


def _unreachable(path: str, why: str) -> JSONResponse:
    log.warning("crypto service unreachable for /%s (%s)", path, why)
    return _err(503, "crypto_service_unavailable")


# ---- /status: answered by FinPilot itself --------------------------------------------------------------------------

_status_cache: tuple[float, dict[str, Any]] | None = None


def reset_status_cache() -> None:
    global _status_cache
    _status_cache = None


async def _probe_health() -> dict[str, Any]:
    status: dict[str, Any] = {
        "configured": upstream.is_configured(),
        "reachable": False,
        "engine": None,
        "dataSource": None,
        "voiceProvider": None,
        "llmConfigured": False,
    }
    if not status["configured"]:
        return status
    try:
        resp = await upstream.shared_client().get("/api/health", timeout=upstream.timeout_for(STATUS_TIMEOUT_SECONDS))
        data = upstream.json_or_none(resp)
        if resp.status_code == 200 and isinstance(data, dict):
            status.update(
                reachable=True,
                engine=data.get("engine"),
                dataSource=data.get("dataSource"),
                voiceProvider=data.get("voiceProvider"),
                llmConfigured=bool(data.get("llmConfigured", False)),
            )
            if "engineOk" in data:
                status["engineOk"] = bool(data["engineOk"])
    except Exception as exc:  # noqa: BLE001 - /status must never 500
        log.info("crypto status probe failed: %s", upstream.error_summary(exc))
    return status


@router.get("/status")
async def crypto_status() -> JSONResponse:
    global _status_cache
    now = time.monotonic()
    if _status_cache is not None and now - _status_cache[0] < STATUS_TTL_SECONDS:
        return JSONResponse(_status_cache[1], headers={"cache-control": "no-store"})
    status = await _probe_health()
    _status_cache = (now, status)
    return JSONResponse(status, headers={"cache-control": "no-store"})


# ---- everything else: allowlisted proxy ------------------------------------------------------------------------------

@router.api_route("/{path:path}", methods=["GET", "POST"], include_in_schema=False)
async def crypto_proxy(path: str, request: Request) -> Response:
    try:
        return await _proxy(request, path)
    except Exception as exc:  # noqa: BLE001 - the browser always gets the {"error": ...} shape
        log.error("crypto bridge internal error on /%s: %s", path, upstream.error_summary(exc))
        return _err(500, "internal_error")
