from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.deps import get_session_id, get_state
from app.errors import ApiError
from app.ratelimit import limiter
from app.schemas.contract import CheckRequest, CheckResponse, ErrorResponse, to_wire
from app.services.pipeline import CheckPipeline, Result, Step
from app.state import AppState

router = APIRouter()

ERRORS: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorResponse, "description": "invalid_address | secret_input"},
    402: {"model": ErrorResponse, "description": "no_credits"},
    429: {"model": ErrorResponse, "description": "rate_limited"},
    503: {"model": CheckResponse, "description": "status=error (graph_unavailable | model_not_trained)"},
}


def _pipeline(state: AppState) -> CheckPipeline:
    if state.pipeline is None:
        raise ApiError(503, "service_not_ready")
    return state.pipeline


def _check_limit() -> str:
    return get_settings().rate_limit_check


@router.post("/api/check", response_model=CheckResponse, responses=ERRORS)
@limiter.limit(_check_limit)
async def check(request: Request, body: CheckRequest, state: AppState = Depends(get_state),
                sid: str = Depends(get_session_id)) -> JSONResponse:
    pipeline = _pipeline(state)
    prepared = pipeline.prepare(body.address, body.lang, sid)
    result: Result | None = None
    async for ev in pipeline.execute(prepared):
        if isinstance(ev, Result):
            result = ev
    assert result is not None
    if result.response is None:
        return JSONResponse(status_code=result.http_status, content={"error": result.error or "error"})
    return JSONResponse(status_code=result.http_status, content=to_wire(result.response))


@router.post("/api/check/stream", responses=ERRORS | {200: {"description": "text/event-stream"}})
@limiter.limit(_check_limit)
async def check_stream(request: Request, body: CheckRequest, state: AppState = Depends(get_state),
                       sid: str = Depends(get_session_id)) -> EventSourceResponse:
    pipeline = _pipeline(state)
    prepared = pipeline.prepare(body.address, body.lang, sid)  # 400/402 before the stream opens

    async def events() -> AsyncIterator[dict[str, str]]:
        async for ev in pipeline.execute(prepared):
            if isinstance(ev, Step):
                yield {"event": "step", "data": json.dumps({"id": ev.id, "label": ev.label})}
            elif ev.response is None:
                yield {"event": "error", "data": json.dumps({"error": ev.error, "status": ev.http_status})}
            else:
                yield {"event": "result", "data": json.dumps(to_wire(ev.response), ensure_ascii=False)}

    return EventSourceResponse(events(), ping=10)
