from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.base import Database
from app.main import build_state, check_production_settings, create_app


def test_security_headers(client: TestClient) -> None:
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"


def test_streaming_body_limit(settings: Settings) -> None:
    s = Settings(_env_file=None, **{**settings.model_dump(), "max_request_bytes": 1000})
    with TestClient(create_app(s, build_state(s))) as c:
        def chunks() -> Any:
            for _ in range(10):
                yield b"x" * 500  # no content-length: chunked

        r = c.post("/api/check", content=chunks(), headers={"content-type": "application/json"})
        assert r.status_code == 413 and r.json() == {"error": "request_too_large"}


def test_unhandled_error_is_json_500(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    st = build_state(settings)

    def boom(*_: Any, **__: Any) -> None:
        raise RuntimeError("secret internals")

    monkeypatch.setattr(st.pipeline, "prepare", boom)
    with TestClient(create_app(settings, st), raise_server_exceptions=False) as c:
        r = c.post("/api/check", json={"address": "DEMO-abc", "lang": "en"})
    assert r.status_code == 500 and r.json() == {"error": "internal_error"}
    assert "secret internals" not in r.text


def test_validation_errors_do_not_echo_input(client: TestClient) -> None:
    r = client.post("/api/check", json={"address": "x" * 600, "lang": "fr"})
    assert r.status_code == 422 and "xxxx" not in r.text and r.json()["error"].startswith("invalid request")


@pytest.mark.parametrize(("kw", "msg"), [
    ({"session_secret": "change_me"}, "SESSION_SECRET"),
    ({"log_salt": ""}, "LOG_SALT"),
    ({"cookie_samesite": "none", "cookie_secure": False}, "COOKIE_SECURE"),
    ({"cors_origins": "*"}, "CORS_ORIGINS"),
])
def test_prod_refuses_unsafe_settings(kw: dict[str, Any], msg: str, tmp_path: Path) -> None:
    ofac = tmp_path / "ofac.txt"  # prod also requires the OFAC list; never depend on a local data/ folder
    ofac.write_text("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n")
    base = dict(_env_file=None, app_env="prod", session_secret="s3cret-value", log_salt="salt-value",
                cors_origins="https://app.example", cookie_samesite="lax", ofac_list_path=ofac)
    with pytest.raises(RuntimeError, match=msg):
        check_production_settings(Settings(**{**base, **kw}))
    check_production_settings(Settings(**base))  # the base itself is fine


def test_additive_migration(tmp_path: Path) -> None:
    db_path = tmp_path / "old.sqlite"
    con = sqlite3.connect(db_path)
    con.execute("CREATE TABLE sessions (id VARCHAR(64) PRIMARY KEY, created_at DATETIME)")
    con.commit()
    con.close()
    Database(f"sqlite:///{db_path}").create_all()
    cols = {r[1] for r in sqlite3.connect(db_path).execute("PRAGMA table_info(sessions)")}
    assert "dodo_customer_id" in cols


def test_cookie_secure_when_samesite_none(settings: Settings) -> None:
    s = Settings(_env_file=None, **{**settings.model_dump(), "cookie_samesite": "none"})
    with TestClient(create_app(s, build_state(s)), base_url="https://testserver") as c:
        cookie = c.get("/api/health").headers["set-cookie"]
    assert "Secure" in cookie and "SameSite=none" in cookie and "HttpOnly" in cookie
