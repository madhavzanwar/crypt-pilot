"""Phase-0 smoke tests -- confirm the app boots and the stub contract holds.
Real behavioural tests live alongside each module (analytics/, forecast/,
simulate/, copilot/) added by the background agents.
"""
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.main import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_dashboard_shape() -> None:
    r = client.get("/api/dashboard/demo-priya")
    assert r.status_code == 200
    body = r.json()
    for key in ("health_score", "forecast", "insights", "recurring_obligations", "debts"):
        assert key in body
    assert 0 <= body["health_score"]["overall"] <= 100


def test_chat_rejects_empty_message() -> None:
    r = client.post("/api/chat", json={"message": ""})
    assert r.status_code == 400


def test_chat_stub_returns_answer_contract() -> None:
    r = client.post("/api/chat", json={"message": "How am I doing?"})
    assert r.status_code == 200
    body = r.json()
    assert "facts" in body and "predictions" in body and "recommendations" in body


def test_chat_accepts_firebase_token_for_non_demo_user(monkeypatch) -> None:
    monkeypatch.setattr(auth_module.google_id_token, "verify_firebase_token", lambda *a, **k: {"sub": "user-A"})
    r = client.post(
        "/api/chat",
        json={"message": "How am I doing?", "user_id": "user-A", "force_offline": True},
        headers={"Authorization": "Bearer abc.def.ghi"},
    )
    assert r.status_code == 200


def test_chat_rejects_non_demo_user_without_token() -> None:
    r = client.post("/api/chat", json={"message": "hi", "user_id": "user-A"})
    assert r.status_code == 401


def test_recurring_next_dates_are_never_in_the_past():
    """BUG-021: a recurring series whose last charge was long ago must roll its next date forward."""
    from datetime import date, timedelta

    from fastapi.testclient import TestClient

    from app.analytics.recurring import roll_forward
    from app.main import app

    today = date(2026, 10, 29)
    assert roll_forward(date(2026, 10, 21), 14, today) == date(2026, 11, 4)  # 21 Oct + 14d
    assert roll_forward(date(2026, 10, 29), 7, today) == today  # today is not "past"
    assert roll_forward(date(2026, 11, 3), 30, today) == date(2026, 11, 3)  # already future: unchanged
    c = TestClient(app)
    for uid in ("demo-priya", "demo-arjun", "demo-meera"):
        for r in c.get(f"/api/dashboard/{uid}").json()["recurring_obligations"]:
            assert date.fromisoformat(r["next_expected_date"]) >= date.today() - timedelta(days=0), (uid, r["merchant"], r["next_expected_date"])
