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

    def check(self, key: str) -> None:
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
                f"Rate limit exceeded ({self.max_calls} requests per {int(self.window_seconds)}s). "
                f"Retry in ~{retry_after}s.",
            )
        q.append(now)


# One shared instance per protected endpoint, keyed by the resolved user_id
# (falls back to a constant key only if user_id somehow isn't available yet).
chat_limiter = RateLimiter(max_calls=30, window_seconds=3600)  # 30 copilot msgs/hour
upload_limiter = RateLimiter(max_calls=10, window_seconds=3600)  # 10 CSV uploads/hour
# Per client address, across every user id: guest ids are self-minted, so a per-user limit alone is bypassed by rotating them.
chat_ip_limiter = RateLimiter(max_calls=60, window_seconds=3600)
voice_ip_limiter = RateLimiter(max_calls=60, window_seconds=600)


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
