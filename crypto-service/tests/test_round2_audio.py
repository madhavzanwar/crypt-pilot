"""BUG-091: ffmpeg concurrency cap, timeout kill+reap."""

from __future__ import annotations

import asyncio
import os
import stat
from pathlib import Path

import pytest

from app.errors import ApiError
from app.services.voice import audio


def _fake_ffmpeg(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, body: str) -> Path:
    script = tmp_path / "ffmpeg"
    script.write_text("#!/bin/sh\n" + body + "\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")
    return script


def test_timeout_kills_and_reaps_and_releases_slot(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_ffmpeg(tmp_path, monkeypatch, "sleep 30")

    async def run() -> None:
        with pytest.raises(ApiError) as ei:
            await audio.to_wav_16k_mono(b"x", 5, timeout_s=0.5)
        assert ei.value.error == "audio_conversion_timeout"
        assert audio._active == 0

    asyncio.run(run())


def test_concurrency_is_capped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_ffmpeg(tmp_path, monkeypatch, "sleep 2")

    async def run() -> list[str]:
        res = await asyncio.gather(*[audio.to_wav_16k_mono(b"x", 5, timeout_s=0.3) for _ in range(5)],
                                   return_exceptions=True)
        return sorted(r.error for r in res if isinstance(r, ApiError))

    errors = asyncio.run(run())
    assert errors.count("voice_busy") == 5 - audio.MAX_CONCURRENT_FFMPEG
    assert errors.count("audio_conversion_timeout") == audio.MAX_CONCURRENT_FFMPEG
    assert audio._active == 0
