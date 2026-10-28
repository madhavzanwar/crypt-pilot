from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.errors import UpstreamError
from app.services.voice import stt
from app.services.voice.extract import extract_address
from app.services.voice.stt import Transcript

GENESIS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
SEGWIT = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"


@pytest.mark.parametrize(("text", "expected"), [
    (f"check {GENESIS} please", GENESIS),
    (f"Check this wallet: {GENESIS}.", GENESIS),
    ("1A1z P1eP5 QGefi2DMP TfTL5S Lmv7Div fNa", GENESIS),
    ("1A1z-P1eP5-QGefi2DMPTfTL5SLmv7DivfNa", GENESIS),
    ("bc1q ar0s rrr7 xfkv y5l6 43ly dnw9 re59 gtzz wf5m dq", SEGWIT),
    ("BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ", SEGWIT),
    ("one capital A one z capital P one e capital P five capital Q G e f i two capital D capital M capital P "
     "capital T f capital T capital L five capital S capital L m v seven capital D i v f capital N a", GENESIS),
    ("my address is 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", None),  # checksum fails
    ("hello there", None),
    ("", None),
])
def test_extract_address(text: str, expected: str | None) -> None:
    assert extract_address(text) == expected


@pytest.fixture
def wav_bytes(tmp_path: Path) -> bytes:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    out = tmp_path / "a.webm"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                    "-c:a", "libopus", str(out)], check=True)
    return out.read_bytes()


def with_settings(settings: Any, **kw: Any) -> Any:
    return type(settings)(_env_file=None, **{**settings.model_dump(), **kw})


def voice_client(settings: Any, **kw: Any) -> TestClient:
    from app.main import build_state, create_app

    s = with_settings(settings, **kw)
    return TestClient(create_app(s, build_state(s)))


def test_transcribe_rejects_bad_type(settings: Any) -> None:
    with voice_client(settings, sarvam_api_key="x", sarvam_stt_model="m") as c:
        r = c.post("/api/transcribe", files={"audio": ("a.txt", b"hello", "text/plain")}, data={"lang": "en"})
        assert r.status_code == 415 and r.json() == {"error": "unsupported_audio_type"}


def test_transcribe_without_providers_is_503(settings: Any, wav_bytes: bytes) -> None:
    with voice_client(settings) as c:
        r = c.post("/api/transcribe", files={"audio": ("a.webm", wav_bytes, "audio/webm")}, data={"lang": "en"})
        assert r.status_code == 503 and r.json() == {"error": "voice_unavailable"}


def test_transcribe_falls_back_and_reports_true_provider(settings: Any, wav_bytes: bytes,
                                                         monkeypatch: pytest.MonkeyPatch) -> None:
    async def wispr_fail(*_: Any) -> Transcript:
        raise UpstreamError("wispr", "http 500")

    async def sarvam_ok(_c: Any, _s: Any, wav: bytes, lang: str) -> Transcript:
        assert wav[:4] == b"RIFF" and lang == "hi"
        return Transcript(f"वॉलेट {GENESIS} चेक करो", "sarvam")

    import app.routers.transcribe as tr

    monkeypatch.setattr(tr, "wispr_transcribe", wispr_fail)
    monkeypatch.setattr(tr, "sarvam_transcribe", sarvam_ok)
    with voice_client(settings, wispr_api_key="w", sarvam_api_key="s", sarvam_stt_model="saaras:v3") as c:
        r = c.post("/api/transcribe", files={"audio": ("a.webm", wav_bytes, "audio/webm;codecs=opus")},
                   data={"lang": "hi"})
    assert r.status_code == 200, r.text
    assert r.json() == {"text": f"वॉलेट {GENESIS} चेक करो", "address": GENESIS, "provider": "sarvam"}


def test_transcribe_drops_spoken_seed_phrase(settings: Any, wav_bytes: bytes, monkeypatch: pytest.MonkeyPatch) -> None:
    async def sarvam_seed(*_: Any) -> Transcript:
        return Transcript(" ".join(["abandon"] * 11 + ["about"]), "sarvam")

    import app.routers.transcribe as tr

    monkeypatch.setattr(tr, "sarvam_transcribe", sarvam_seed)
    with voice_client(settings, sarvam_api_key="s", sarvam_stt_model="m") as c:
        r = c.post("/api/transcribe", files={"audio": ("a.webm", wav_bytes, "audio/webm")}, data={"lang": "en"})
    assert r.status_code == 400 and r.json() == {"error": "secret_input"} and "abandon" not in r.text


def test_stt_chain_order(settings: Any) -> None:
    assert stt.stt_chain(with_settings(settings, wispr_api_key="w", sarvam_api_key="s",
                                       sarvam_stt_model="m")) == ["wispr", "sarvam"]
    assert stt.stt_chain(settings) == []
