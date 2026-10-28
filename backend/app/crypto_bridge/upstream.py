"""Shared plumbing for the crypto bridge: where the crypto service lives and how we talk to it.

The service URL is read from the environment on every call (CRYPTO_SERVICE_URL, default http://127.0.0.1:8200;
set it to an empty string to disable the bridge). It is never returned to the browser.
"""
from __future__ import annotations

import http.cookiejar
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("finpilot.crypto_bridge")

DEFAULT_SERVICE_URL = "http://127.0.0.1:8200"
CONNECT_TIMEOUT = 5.0
DEFAULT_TIMEOUT = 15.0
CHECK_TIMEOUT = 60.0

# Tests inject an httpx.MockTransport here; None means real network.
_transport: httpx.AsyncBaseTransport | None = None
_shared: httpx.AsyncClient | None = None


def service_url() -> str:
    """Base URL of the crypto service without a trailing slash, or "" when the bridge is disabled."""
    raw = os.environ.get("CRYPTO_SERVICE_URL")
    if raw is None:
        raw = DEFAULT_SERVICE_URL
    return raw.strip().rstrip("/")


def is_configured() -> bool:
    return bool(service_url())


def _timeout(read: float) -> httpx.Timeout:
    return httpx.Timeout(read, connect=CONNECT_TIMEOUT)


def new_client(read_timeout: float = DEFAULT_TIMEOUT) -> httpx.AsyncClient:
    """A client that never stores or replays cookies (the browser owns the session cookie, not this process)."""
    client = httpx.AsyncClient(
        base_url=service_url(),
        timeout=_timeout(read_timeout),
        transport=_transport,
        follow_redirects=False,
    )
    client.cookies.jar.set_policy(http.cookiejar.DefaultCookiePolicy(allowed_domains=[]))
    return client


def shared_client() -> httpx.AsyncClient:
    global _shared
    if _shared is None or _shared.is_closed:
        _shared = new_client()
    return _shared


def reset_shared_client() -> None:
    """Forget the shared client (tests; also lets a changed CRYPTO_SERVICE_URL take effect)."""
    global _shared
    _shared = None


def timeout_for(read: float) -> httpx.Timeout:
    return _timeout(read)


def error_summary(exc: BaseException) -> str:
    return type(exc).__name__


def json_or_none(resp: httpx.Response) -> Any | None:
    try:
        return resp.json()
    except ValueError:
        return None
