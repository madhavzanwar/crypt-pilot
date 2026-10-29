"""Audio validation and conversion (ffmpeg via subprocess, with timeouts)."""

from __future__ import annotations

import asyncio
import os
import shutil
from collections.abc import Callable

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


MAX_CONCURRENT_FFMPEG = 2          # more than this are refused with 503 voice_busy instead of piling up processes
FFMPEG_CPU_SECONDS = 20            # RLIMIT_CPU for the child (posix)
FFMPEG_ADDRESS_SPACE = 1 << 30     # RLIMIT_AS for the child (posix), 1 GiB
_active = 0


def _limits() -> Callable[[], None] | None:
    if os.name != "posix":
        return None

    def apply() -> None:  # runs in the child between fork and exec
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (FFMPEG_CPU_SECONDS, FFMPEG_CPU_SECONDS))
        resource.setrlimit(resource.RLIMIT_AS, (FFMPEG_ADDRESS_SPACE, FFMPEG_ADDRESS_SPACE))

    return apply


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


async def to_wav_16k_mono(data: bytes, max_seconds: float, timeout_s: float = 15.0) -> bytes:
    """Convert any supported container to 16 kHz mono 16-bit PCM WAV, truncated at max_seconds + 1.

    At most MAX_CONCURRENT_FFMPEG conversions run at once (the rest get 503 voice_busy); the child has CPU and
    memory rlimits on posix; on timeout it is killed AND reaped.
    """
    global _active
    if not ffmpeg_available():
        raise ApiError(503, "voice_unavailable")
    if _active >= MAX_CONCURRENT_FFMPEG:
        raise ApiError(503, "voice_busy")
    _active += 1
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", "pipe:0",
            "-t", str(max_seconds + 1), "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", "pipe:1",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            preexec_fn=_limits())
        try:
            out, _ = await asyncio.wait_for(proc.communicate(data), timeout=timeout_s)
        except BaseException as exc:  # timeout, client disconnect (cancel), anything: never leave it running
            if proc.returncode is None:
                proc.kill()
            await asyncio.shield(proc.wait())
            if isinstance(exc, TimeoutError):
                raise ApiError(422, "audio_conversion_timeout") from exc
            raise
    finally:
        _active -= 1
    if proc.returncode != 0 or len(out) <= 44:
        raise ApiError(422, "audio_unreadable")
    if (len(out) - 44) / WAV_BYTES_PER_SECOND > max_seconds:
        raise ApiError(413, "audio_too_long")
    return out
