"""Speech-to-text: Wispr Flow (if WISPR_API_KEY) else Sarvam. The provider reported to the client is
the one that actually produced the text."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.config import Settings
from app.errors import UpstreamError

_SARVAM_LANG = {"en": "en-IN", "hi": "hi-IN"}


@dataclass
class Transcript:
    text: str
    provider: Literal["wispr", "sarvam"]


async def wispr_transcribe(client: httpx.AsyncClient, s: Settings, wav: bytes, lang: str) -> Transcript:
    """Wispr Flow REST (exclusive-access API; request shape per the provided quickstart, unverified)."""
    body: dict[str, Any] = {"audio": base64.b64encode(wav).decode(), "language": [lang],
                            "context": {"app": {"type": "other"}, "dictionary_context": []}}
    try:
        r = await client.post(s.wispr_api_url, json=body, timeout=s.voice_timeout_s,
                              headers={"authorization": f"Bearer {s.wispr_api_key.get_secret_value()}"})
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPStatusError as exc:
        raise UpstreamError("wispr", f"http {exc.response.status_code}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamError("wispr", type(exc).__name__) from exc
    text = data.get("text") or data.get("transcript") or ""
    if not isinstance(text, str) or not text.strip():
        raise UpstreamError("wispr", "empty transcript")
    return Transcript(text.strip(), "wispr")


async def sarvam_transcribe(client: httpx.AsyncClient, s: Settings, wav: bytes, lang: str) -> Transcript:
    """Sarvam speech-to-text (multipart; verified against the sarvamai 0.1.40 SDK source and live on 2026-10-28)."""
    data = {"model": s.sarvam_stt_model, "language_code": _SARVAM_LANG.get(lang, "unknown")}
    try:
        r = await client.post(f"{s.sarvam_api_url}/speech-to-text", data=data,
                              files={"file": ("audio.wav", wav, "audio/wav")}, timeout=s.voice_timeout_s,
                              headers={"api-subscription-key": s.sarvam_api_key.get_secret_value()})
        r.raise_for_status()
        body = r.json()
    except httpx.HTTPStatusError as exc:
        raise UpstreamError("sarvam", f"http {exc.response.status_code}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamError("sarvam", type(exc).__name__) from exc
    text = body.get("transcript", "")
    if not isinstance(text, str) or not text.strip():
        raise UpstreamError("sarvam", "empty transcript")
    return Transcript(text.strip(), "sarvam")


def stt_chain(s: Settings) -> list[str]:
    chain = []
    if s.wispr_api_key.get_secret_value():
        chain.append("wispr")
    if s.sarvam_api_key.get_secret_value() and s.sarvam_stt_model:
        chain.append("sarvam")
    return chain
