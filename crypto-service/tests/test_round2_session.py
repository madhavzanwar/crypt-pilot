"""BUG-086 (server-side session expiry), BUG-015 (non-ASCII cookie direct), BUG-088 (parse error leak, HEAD)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.models import SessionRow


def _sid(c: Any) -> str:
    return c.cookies.get("cryptiq_sid").rsplit(".", 1)[0]


def test_idle_session_expires_server_side(client: Any) -> None:
    assert client.get("/api/credits").json()["balance"] == 3
    sid = _sid(client)
    cookie = client.cookies.get("cryptiq_sid")
    client.post("/api/check", json={"address": "DEMO-notindataset", "lang": "en"})
    with client.app.state.cryptiq.db.session() as s:
        s.get(SessionRow, sid).created_at = datetime.now(UTC) - timedelta(days=40)
        s.get(SessionRow, sid).last_seen_at = datetime.now(UTC) - timedelta(days=31)
    client.get("/api/credits")
    assert _sid(client) != sid and client.cookies.get("cryptiq_sid") != cookie  # a new session was minted
    # a recently seen session survives and is refreshed
    sid2 = _sid(client)
    with client.app.state.cryptiq.db.session() as s:
        s.get(SessionRow, sid2).last_seen_at = datetime.now(UTC) - timedelta(days=2)
    client.get("/api/credits")
    assert _sid(client) == sid2
    with client.app.state.cryptiq.db.session() as s:
        assert datetime.now(UTC) - s.get(SessionRow, sid2).last_seen_at.replace(tzinfo=UTC) < timedelta(minutes=1)


def test_non_ascii_session_cookie_direct(client: Any) -> None:
    for raw in ("cryptiq_sid=abc.é", "cryptiq_sid=日本.語", "cryptiq_sid=.", "cryptiq_sid=a.b.c.d"):
        r = client.get("/api/credits", headers={"cookie": raw.encode("utf-8")})
        assert r.status_code == 200, raw


def test_json_parse_error_does_not_leak_offset(client: Any) -> None:
    r = client.post("/api/check", content=b'{"address": "x", ', headers={"content-type": "application/json"})
    assert r.status_code == 422
    assert not any(ch.isdigit() for ch in r.json()["error"]), r.json()


def test_head_on_health_and_status(client: Any) -> None:
    assert client.head("/api/health").status_code == 200
