"""BUG-013 (prod by default in the image) and BUG-038 (uvicorn must not trust X-Forwarded-For)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.config import Settings
from app.main import check_production_settings

ROOT = Path(__file__).resolve().parents[1]


def test_dockerfile_defaults_to_prod() -> None:
    text = (ROOT / "Dockerfile").read_text()
    assert "APP_ENV=prod" in text


def test_entrypoint_disables_uvicorn_proxy_headers() -> None:
    assert "--no-proxy-headers" in (ROOT / "docker-entrypoint.sh").read_text()


def test_prod_refuses_placeholder_secrets(tmp_path: Path) -> None:
    ofac = tmp_path / "ofac.txt"
    ofac.write_text("x\n")
    base: dict[str, Any] = dict(_env_file=None, app_env="prod", ofac_list_path=ofac, cors_origins="https://a.example")
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        check_production_settings(Settings(**base))  # session_secret / log_salt still "change_me"
    check_production_settings(Settings(**base, session_secret="s" * 32, log_salt="l" * 16))
