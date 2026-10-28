"""Typed errors and handlers. Every error response is {"error": string} with a proper status."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging_setup import log


class ApiError(Exception):
    def __init__(self, status: int, error: str) -> None:
        super().__init__(error)
        self.status = status
        self.error = error


class UpstreamError(Exception):
    """An external service failed (timeout, bad status, bad payload)."""

    def __init__(self, service: str, detail: str) -> None:
        super().__init__(f"{service}: {detail}")
        self.service = service
        self.detail = detail


def _json(status: int, error: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": error})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError) -> JSONResponse:
        return _json(exc.status, exc.error)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # never echo the input back (it might be a secret)
        fields = sorted({".".join(str(p) for p in e.get("loc", ())[1:]) for e in exc.errors()})
        return _json(422, f"invalid request: {', '.join(f for f in fields if f) or 'body'}")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _json(exc.status_code, str(exc.detail) if exc.detail else "error")

    @app.exception_handler(RateLimitExceeded)
    async def _rate(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return _json(429, "rate_limited")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_error", path=request.url.path, exc_type=type(exc).__name__)
        return _json(500, "internal_error")
