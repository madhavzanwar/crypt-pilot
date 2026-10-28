"""Optional Sarvam text-to-speech for explanations, cached on disk by content hash."""

from __future__ import annotations

import base64
import hashlib
import time
from pathlib import Path

import httpx

from app.config import Settings
from app.errors import UpstreamError
from app.logging_setup import log

_LANG = {"en": "en-IN", "hi": "hi-IN"}
MAX_AGE_S = 24 * 3600


class TTS:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.s = settings
        self.client = client
        self.dir = settings.artifacts_dir / "audio"

    @property
    def configured(self) -> bool:
        return bool(self.s.sarvam_api_key.get_secret_value() and self.s.sarvam_tts_model)

    def path_for(self, text: str, lang: str) -> Path:
        key = hashlib.sha256(f"{self.s.sarvam_tts_model}|{self.s.sarvam_tts_speaker}|{lang}|{text}".encode())
        return self.dir / f"{key.hexdigest()[:32]}.mp3"

    async def synthesize(self, text: str, lang: str) -> str | None:
        """Return the public URL path of an mp3, or None (frontend then uses browser speech)."""
        if not self.configured:
            return None
        path = self.path_for(text, lang)
        if not path.exists():
            body = {"text": text[:1500], "language_code": _LANG.get(lang, "en-IN"), "model": self.s.sarvam_tts_model,
                    "output_audio_codec": "mp3"}
            if self.s.sarvam_tts_speaker:
                body["speaker"] = self.s.sarvam_tts_speaker
            try:
                r = await self.client.post(f"{self.s.sarvam_api_url}/text-to-speech", json=body,
                                           timeout=self.s.voice_timeout_s,
                                           headers={"api-subscription-key": self.s.sarvam_api_key.get_secret_value()})
                r.raise_for_status()
                audio = base64.b64decode(r.json()["audios"][0])
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
                log.warning("tts_failed", err=type(exc).__name__)
                return None
            self.dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(audio)
            self.cleanup()
        return f"/api/audio/{path.name}"

    def cleanup(self) -> None:
        now = time.time()
        for f in self.dir.glob("*.mp3"):
            if now - f.stat().st_mtime > MAX_AGE_S:
                f.unlink(missing_ok=True)


__all__ = ["TTS", "UpstreamError"]
