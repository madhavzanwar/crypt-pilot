"""slowapi limiter keyed on the client IP (cookies can be dropped to dodge per-session limits).

Behind Fly.io the real client IP is in `Fly-Client-IP`, which Fly's proxy sets itself. It is trusted only
when TRUST_FLY_CLIENT_IP=true (the app must not be reachable except through Fly).

Behind the FinPilot bridge (or any proxy you control) set CRYPTO_TRUST_PROXY=true: the bridge sets
`X-Forwarded-For` itself, and the rightmost entry (TRUSTED_PROXY_HOPS from the right) is the client. The first
entry is never used: a client can send its own. Without the flag X-Forwarded-For is ignored entirely.
"""

from __future__ import annotations

from contextvars import ContextVar

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import Settings, get_settings


def client_key(request: Request) -> str:
    return resolve_client_ip(request, get_settings())


def resolve_client_ip(request: Request, st: Settings) -> str:
    if st.trust_proxy:
        chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if chain:
            return chain[-st.trusted_proxy_hops] if len(chain) >= st.trusted_proxy_hops else chain[0]
    if st.trust_fly_client_ip:
        ip = request.headers.get("fly-client-ip", "").strip()
        if ip:
            return ip
    return get_remote_address(request)


client_ip_var: ContextVar[str | None] = ContextVar("client_ip", default=None)  # set per request by the middleware

limiter = Limiter(key_func=client_key, headers_enabled=False)
