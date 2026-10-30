"""Minimal in-memory rate limiter.

Scope/limitation (documented, not hidden): this is a single-process, in-memory
sliding-window counter. It resets on restart and does not share state across
multiple backend instances. That's an acceptable tradeoff for this app's
current scale; a production deployment with >1 backend process should swap
this for a shared store (e.g. Redis) keyed the same way. It still meaningfully
protects against the two costliest abuse paths today: hammering the AI
API through /chat, and DoS-ing the CSV parser through /upload.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def _human_wait(self, seconds: int) -> str:
        if seconds < 90:
            return "a minute" if seconds > 45 else f"{max(seconds, 1)} seconds"
        minutes = round(seconds / 60)
        if minutes >= 55:
            return "an hour" if minutes <= 65 else f"{round(minutes / 60)} hours"
        return f"{minutes} minutes"

    def check(self, key: str, *, record: bool = True) -> None:
        """Raise 429 when `key` is over its limit. With `record=False` the call is only checked; call `record(key)` once the
        request turned out to be valid, so rejected/failed attempts do not eat the user's allowance."""
        now = time.monotonic()
        if len(self._calls) > 5000:  # evict idle keys so unique client ids cannot grow memory without bound
            for k in [k for k, v in self._calls.items() if not v or now - v[-1] > self.window_seconds]:
                del self._calls[k]
        q = self._calls[key]
        while q and now - q[0] > self.window_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            retry_after = int(self.window_seconds - (now - q[0])) + 1
            raise HTTPException(
                429,
                f"You've reached the limit for now ({self.max_calls} per {self._human_wait(int(self.window_seconds))}). "
                f"Retry in about {self._human_wait(retry_after)}.",
                headers={"Retry-After": str(retry_after)},
            )
        if record:
            q.append(now)

    def record(self, key: str) -> None:
        """Count one accepted request against `key` (pair with `check(key, record=False)`)."""
        self._calls[key].append(time.monotonic())


# One shared instance per protected endpoint, keyed by the resolved user_id
# (falls back to a constant key only if user_id somehow isn't available yet).
chat_limiter = RateLimiter(max_calls=30, window_seconds=3600)  # 30 copilot msgs/hour
upload_limiter = RateLimiter(max_calls=10, window_seconds=3600)  # 10 CSV uploads/hour


def client_ip(request: Request | None) -> str:
    """Best-effort caller address (first X-Forwarded-For hop behind a proxy, else the socket peer)."""
    if request is None:
        return "unknown"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


def scoped_key(request: Request | None, user_id: str) -> str:
    """Rate-limit key. Demo/guest ids are shared by every visitor, so they are keyed per (client, id);
    real accounts stay keyed by user id alone."""
    from app.core.auth import is_public_user

    return f"{client_ip(request)}:{user_id}" if is_public_user(user_id) else user_id
