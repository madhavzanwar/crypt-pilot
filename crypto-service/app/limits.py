"""Pure-ASGI guards: streaming request-body limit (also catches chunked uploads without
Content-Length) and baseline security headers."""

from __future__ import annotations

import json
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
    (b"cross-origin-resource-policy", b"cross-origin"),
]


class BodyLimitAndHeaders:
    def __init__(self, app: ASGIApp, max_bytes: int, hsts: bool = False) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.headers = SECURITY_HEADERS + ([(b"strict-transport-security", b"max-age=31536000")] if hsts else [])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        seen = 0
        started = False
        rejected = False

        async def limited_receive() -> Message:
            nonlocal seen, rejected
            if rejected:
                return {"type": "http.disconnect"}
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.max_bytes:
                    rejected = True
                    if not started:
                        await _json(send, 413, {"error": "request_too_large"}, self.headers)
                    return {"type": "http.disconnect"}  # the app stops reading; its reply is dropped
            return msg

        async def send_with_headers(msg: Message) -> None:
            nonlocal started
            if rejected:
                return
            if msg["type"] == "http.response.start":
                started = True
                existing = {k.lower() for k, _ in msg.get("headers", [])}
                msg["headers"] = list(msg.get("headers", [])) + [h for h in self.headers if h[0] not in existing]
            await send(msg)

        await self.app(scope, limited_receive, send_with_headers)


async def _json(send: Send, status: int, body: dict[str, Any], extra: list[tuple[bytes, bytes]]) -> None:
    data = json.dumps(body).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(data)).encode()),
                            *extra]})
    await send({"type": "http.response.body", "body": data})
