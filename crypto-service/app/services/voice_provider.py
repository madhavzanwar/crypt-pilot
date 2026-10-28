"""Which speech-to-text provider is configured (reported truthfully by /api/health)."""

from __future__ import annotations

from typing import Literal

from app.config import Settings


def configured_voice_provider(settings: Settings) -> Literal["wispr", "sarvam", "browser"]:
    if settings.wispr_api_key.get_secret_value():
        return "wispr"
    if settings.sarvam_api_key.get_secret_value() and settings.sarvam_stt_model:
        return "sarvam"
    return "browser"
