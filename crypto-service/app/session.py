"""Anonymous cookie sessions: `cryptiq_sid` = <random id>.<HMAC>. httpOnly, SameSite from env."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Request, Response

from app.config import Settings
from app.db.base import Database
from app.db.models import SessionRow

COOKIE_NAME = "cryptiq_sid"
MAX_AGE = 60 * 60 * 24 * 30


def _sign(sid: str, secret: str) -> str:
    return hmac.new(secret.encode(), sid.encode(), hashlib.sha256).hexdigest()[:32]


def read_session_id(request: Request, settings: Settings) -> str | None:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw or "." not in raw:
        return None
    sid, sig = raw.rsplit(".", 1)
    if not hmac.compare_digest(sig.encode("utf-8", "replace"),
                              _sign(sid, settings.session_secret.get_secret_value()).encode()):
        return None
    return sid


def session_is_live(db: Database, sid: str, ttl_days: int) -> bool:
    """Server-side expiry (BUG-086). A known session idle for more than `ttl_days` is expired (False); a live one
    has `last_seen_at` refreshed at most once a day. Unknown ids (not created yet) are live."""
    now = datetime.now(UTC)
    with db.session() as s:
        row = s.get(SessionRow, sid)
        if row is None:
            return True
        seen = row.last_seen_at or row.created_at
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=UTC)
        if ttl_days > 0 and now - seen > timedelta(days=ttl_days):
            return False
        if now - seen > timedelta(days=1):
            row.last_seen_at = now
        return True


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
