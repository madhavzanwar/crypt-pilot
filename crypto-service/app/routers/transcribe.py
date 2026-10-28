from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.config import get_settings
from app.deps import get_state
from app.errors import ApiError, UpstreamError
from app.logging_setup import log
from app.ratelimit import limiter
from app.schemas.contract import ErrorResponse, TranscribeResponse
from app.services.address import looks_like_secret
from app.services.voice.audio import check_upload, to_wav_16k_mono
from app.services.voice.extract import extract_address
from app.services.voice.stt import Transcript, sarvam_transcribe, stt_chain, wispr_transcribe
from app.state import AppState

router = APIRouter()


def _limit() -> str:
    return get_settings().rate_limit_transcribe


@router.post("/api/transcribe", response_model=TranscribeResponse, responses={
    400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse},
    503: {"model": ErrorResponse, "description": "voice_unavailable: use browser speech recognition"}})
@limiter.limit(_limit)
async def transcribe(request: Request, audio: UploadFile = File(...), lang: Literal["en", "hi"] = Form("en"),
                     state: AppState = Depends(get_state)) -> TranscribeResponse:
    s = state.settings
    data = await audio.read(s.max_audio_bytes + 1)
    check_upload(audio.content_type, data, s.max_audio_bytes)
    chain = stt_chain(s)
    if not chain:
        raise ApiError(503, "voice_unavailable")
    wav = await to_wav_16k_mono(data, s.max_audio_seconds)
    result: Transcript | None = None
    for provider in chain:
        try:
            fn = wispr_transcribe if provider == "wispr" else sarvam_transcribe
            result = await fn(state.http, s, wav, lang)
            break
        except UpstreamError as exc:
            log.warning("stt_failed", provider=provider, detail=exc.detail)
    if result is None:
        raise ApiError(503, "voice_unavailable")
    if looks_like_secret(result.text):
        raise ApiError(400, "secret_input")  # the transcript is dropped, never returned or logged
    return TranscribeResponse(text=result.text, address=extract_address(result.text), provider=result.provider)
