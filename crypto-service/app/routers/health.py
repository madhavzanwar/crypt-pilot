from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_state
from app.schemas.contract import HealthResponse
from app.services.voice_provider import configured_voice_provider
from app.state import AppState

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse, response_model_exclude_none=True)
async def health(state: AppState = Depends(get_state)) -> HealthResponse:
    s = state.settings
    resp = HealthResponse(ok=True, voice_provider=configured_voice_provider(s),
                          llm_configured=s.llm_configured)
    p = state.pipeline
    if p is not None:
        resp.engine = p.engine.name
        resp.engine_ok = await p.engine_ok()
        resp.model_loaded = p.scorer is not None
        resp.ofac_loaded = p.labels.ofac_loaded
        resp.data_source = p.data_source
        resp.mocks = p.data_source != "elliptic++" or None
    else:
        resp.model_loaded = False
        resp.engine_ok = False
    return resp
