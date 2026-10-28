"""Audio validation and conversion (ffmpeg via subprocess, with timeouts)."""

from __future__ import annotations

import asyncio
import shutil

from app.errors import ApiError

ALLOWED_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/m4a",
                 "audio/x-m4a"}
# magic numbers: webm/mkv (EBML), ogg, wav (RIFF....WAVE), mp4 (....ftyp)
_MAGIC = (b"\x1a\x45\xdf\xa3", b"OggS", b"RIFF")
WAV_BYTES_PER_SECOND = 16000 * 2  # 16 kHz, mono, 16-bit


def check_upload(content_type: str | None, data: bytes, max_bytes: int) -> None:
    base = (content_type or "").split(";")[0].strip().lower()
    if base not in ALLOWED_TYPES:
        raise ApiError(415, "unsupported_audio_type")
    if not data:
        raise ApiError(400, "empty_audio")
    if len(data) > max_bytes:
        raise ApiError(413, "audio_too_large")
    if not (data.startswith(_MAGIC) or data[4:8] == b"ftyp"):
        raise ApiError(415, "unsupported_audio_type")


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


async def to_wav_16k_mono(data: bytes, max_seconds: float, timeout_s: float = 15.0) -> bytes:
    """Convert any supported container to 16 kHz mono 16-bit PCM WAV, truncated at max_seconds + 1."""
    if not ffmpeg_available():
        raise ApiError(503, "voice_unavailable")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-t", str(max_seconds + 1),
        "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", "pipe:1",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, _ = await asyncio.wait_for(proc.communicate(data), timeout=timeout_s)
    except TimeoutError as exc:
        proc.kill()
        raise ApiError(422, "audio_conversion_timeout") from exc
    if proc.returncode != 0 or len(out) <= 44:
        raise ApiError(422, "audio_unreadable")
    if (len(out) - 44) / WAV_BYTES_PER_SECOND > max_seconds:
        raise ApiError(413, "audio_too_long")
    return out
