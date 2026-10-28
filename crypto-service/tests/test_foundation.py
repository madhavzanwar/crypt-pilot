from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.base import Database
from app.services.billing import ledger
from app.session import COOKIE_NAME


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["voiceProvider"] in {"wispr", "sarvam", "browser"}


def test_session_cookie_flags(client: TestClient) -> None:
    r = client.get("/api/health")
    cookie = r.headers["set-cookie"]
    assert cookie.startswith(COOKIE_NAME + "=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    # a valid cookie is kept, not re-issued
    r2 = client.get("/api/health")
    assert "set-cookie" not in r2.headers


def test_tampered_cookie_is_replaced(client: TestClient) -> None:
    client.cookies.set(COOKIE_NAME, "abc.deadbeef")
    r = client.get("/api/health")
    assert "set-cookie" in r.headers


def test_cors_allow_list(client: TestClient) -> None:
    ok = client.options("/api/health", headers={"Origin": "http://localhost:3000",
                                                "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert ok.headers.get("access-control-allow-credentials") == "true"
    bad = client.options("/api/health", headers={"Origin": "https://evil.example",
                                                 "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_unknown_route_returns_error_shape(client: TestClient) -> None:
    r = client.get("/api/nope")
    assert r.status_code == 404
    assert r.json() == {"error": "Not Found"}


def test_ledger_idempotent_grants(tmp_path) -> None:  # type: ignore[no-untyped-def]
    db = Database(f"sqlite:///{tmp_path}/l.sqlite")
    db.create_all()
    with db.session() as s:
        assert ledger.ensure_session(s, "s1", 3)
        assert not ledger.ensure_session(s, "s1", 3)
    with db.session() as s:
        assert ledger.add_credits(s, "s1", 5, "dodo", "evt_1")
        assert not ledger.add_credits(s, "s1", 5, "dodo", "evt_1")
        assert ledger.balance(s, "s1") == 8
        assert ledger.try_charge(s, "s1", "chk_1") == 7
    with db.session() as s:
        for i in range(7):
            assert ledger.try_charge(s, "s1", f"c{i}") is not None
        assert ledger.try_charge(s, "s1", "c-last") is None
        assert ledger.balance(s, "s1") == 0
