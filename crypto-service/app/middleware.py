"""Request-ID, session cookie and body-size middleware (pure ASGI-friendly Starlette middleware)."""

from __future__ import annotations

import secrets
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import Settings
from app.logging_setup import log
from app.session import new_session_id, read_session_id, set_session_cookie


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object, settings: Settings) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.settings = settings

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("x-request-id", "")[:64] or secrets.token_hex(8)
        structlog.contextvars.bind_contextvars(request_id=request_id)
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > self.settings.max_request_bytes:
            return JSONResponse(status_code=413, content={"error": "request_too_large"})

        sid = read_session_id(request, self.settings)
        is_new = sid is None
        request.state.sid = sid or new_session_id()

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            # handled here (not re-raised to the server) so uvicorn keeps the keep-alive connection open
            log.error("unhandled_error", path=request.url.path, exc_type=type(exc).__name__)
            response = JSONResponse(status_code=500, content={"error": "internal_error"})
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
        if is_new:
            set_session_cookie(response, request.state.sid, self.settings)
        response.headers["x-request-id"] = request_id
        log.info("request", method=request.method, path=request.url.path, status=response.status_code,
                 ms=round((time.perf_counter() - start) * 1000, 1), request_id=request_id)
        return response
