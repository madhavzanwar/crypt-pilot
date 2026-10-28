"""Onboarding questionnaire: depths nest, answers save per level, and the Copilot sees them."""
from fastapi.testclient import TestClient

from app import profile
from app.copilot import nugen
from app.core import store
from app.main import app
from app.models import ProfileRow
from app.rag import corpus

c = TestClient(app)
UID = "guest-profiletest001"


def _cleanup():
    store.delete(ProfileRow, UID)


def test_levels_nest():
    ids = {lv: [q["id"] for q in profile.questions(lv)] for lv in profile.LEVELS}
    assert ids["basic"] == ["age", "role", "role_other", "monthly_income", "savings_goal", "save_target", "comfort", "name"]
    assert ids["basic"] == ids["standard"][:8] and ids["standard"] == ids["deep"][: len(ids["standard"])]
    assert len(ids["basic"]) < len(ids["standard"]) < len(ids["deep"])


def test_save_get_and_copilot_context():
    try:
        assert c.get(f"/api/profile/{UID}").json()["completed"] is False
        r = c.put(f"/api/profile/{UID}", json={"level": "basic", "answers": {"name": "Asha", "role": "Farmer", "city": "ignored: not a basic question"}})
        assert r.status_code == 200 and r.json()["answers"] == {"name": "Asha", "role": "Farmer"}
        assert "Farmer" in nugen._context(UID)["about_the_user"]
        assert any(card[1] == "profile" and "Farmer" in card[2] for card in corpus._static_cards(UID, []))
        c.put(f"/api/profile/{UID}", json={"level": "standard", "answers": {"city": "Pune"}})  # upgrading keeps earlier answers
        got = c.get(f"/api/profile/{UID}").json()
        assert got["level"] == "standard" and got["answers"]["name"] == "Asha" and got["answers"]["city"] == "Pune"
    finally:
        _cleanup()


def test_skip_marks_completed_and_bad_level_rejected():
    try:
        out = c.put(f"/api/profile/{UID}", json={"level": "skipped"}).json()
        assert out["completed"] is True and out["level"] == "skipped" and out["answers"] == {}
        assert c.put(f"/api/profile/{UID}", json={"level": "extreme"}).status_code == 422
        assert "basic" in c.get("/api/profile/questions").json()
    finally:
        _cleanup()
