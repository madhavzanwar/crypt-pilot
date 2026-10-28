"""slowapi limiter keyed on the client IP (cookies can be dropped to dodge per-session limits).

Behind Fly.io the real client IP is in `Fly-Client-IP`, which Fly's proxy sets itself. It is trusted only
when TRUST_FLY_CLIENT_IP=true (the app must not be reachable except through Fly). `X-Forwarded-For` is
never trusted for rate limiting: a client can send its own.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import get_settings


def client_key(request: Request) -> str:
    if get_settings().trust_fly_client_ip:
        ip = request.headers.get("fly-client-ip", "").strip()
        if ip:
            return ip
    return get_remote_address(request)


limiter = Limiter(key_func=client_key, headers_enabled=False)
