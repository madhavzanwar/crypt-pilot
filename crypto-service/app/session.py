"""Anonymous cookie sessions: `cryptiq_sid` = <random id>.<HMAC>. httpOnly, SameSite from env."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Request, Response

from app.config import Settings

COOKIE_NAME = "cryptiq_sid"
MAX_AGE = 60 * 60 * 24 * 30


def _sign(sid: str, secret: str) -> str:
    return hmac.new(secret.encode(), sid.encode(), hashlib.sha256).hexdigest()[:32]


def read_session_id(request: Request, settings: Settings) -> str | None:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw or "." not in raw:
        return None
    sid, sig = raw.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(sid, settings.session_secret.get_secret_value())):
        return None
    return sid


def new_session_id() -> str:
    return secrets.token_urlsafe(24)


def set_session_cookie(response: Response, sid: str, settings: Settings) -> None:
    secure = settings.cookie_secure or settings.cookie_samesite == "none"
    response.set_cookie(
        COOKIE_NAME,
        f"{sid}.{_sign(sid, settings.session_secret.get_secret_value())}",
        max_age=MAX_AGE,
        httponly=True,
        secure=secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
