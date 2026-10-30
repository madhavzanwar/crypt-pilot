"""Gates for the endpoints that are not tied to a user id but cost money or reveal server state
(/api/ops/*, /api/translate, /api/web/*).

- Demo mode (FINPILOT_DEMO_MODE=true, the default): open to anyone so the public demo keeps working, but every
  caller is rate-limited per client address, and key tails are never shown.
- Otherwise: a valid Firebase bearer token is required (ops: the OPS_ADMIN_TOKEN header instead).
- OPS_ADMIN_TOKEN (optional env): header `X-Ops-Token` unlocks the masked key tails and removes the probe limit.
"""
from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.ratelimit import RateLimiter, client_ip

translate_limiter = RateLimiter(150, 600)  # per client: 150 translate calls that reach the model / 10 min (cache hits are free)
web_limiter = RateLimiter(20, 60)  # per client: 20 web-intel calls / minute (the shared Tavily cap stays on top)
ops_limiter = RateLimiter(60, 60)
probe_limiter = RateLimiter(6, 60)


def is_ops_admin(token: str | None) -> bool:
    expected = os.getenv("OPS_ADMIN_TOKEN", "")
    return bool(expected and token and hmac.compare_digest(token, expected))


async def _require_signed_in(authorization: str | None) -> None:
    from app.core.auth import verify_token

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Authentication required")
    await run_in_threadpool(verify_token, token)


async def require_caller(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Dependency for translate/web: anyone in demo mode, signed-in users otherwise."""
    if not get_settings().demo_mode:
        await _require_signed_in(authorization)


def ops_access(request: Request, x_ops_token: str | None = Header(default=None)) -> bool:
    """Dependency for ops: returns True for the admin. Raises 403 when neither admin nor demo mode."""
    admin = is_ops_admin(x_ops_token)
    if not admin and not get_settings().demo_mode:
        raise HTTPException(403, "Ops console requires the admin token")
    if not admin:
        ops_limiter.check(client_ip(request))
    return admin
