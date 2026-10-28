"""Background job stages: token guard and one full pass through the stages the Inngest function chains."""
import pytest
from fastapi.testclient import TestClient

from app.api import jobs_router
from app.main import app
from app.security import agents, ai_agents

client = TestClient(app)
H = {"x-job-token": "secret"}
FINDING = {"agent": "duplicate_detector", "severity": "high", "title": "Possible double charge", "detail": "d", "merchant": "Swiggy", "amount": 10.0, "txn_ids": ["1"]}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    monkeypatch.setenv("INNGEST_JOB_TOKEN", "secret")
    monkeypatch.setattr(jobs_router.store, "query", lambda *a, **k: [])
    monkeypatch.setattr(jobs_router.store, "put", lambda *a, **k: None)
    monkeypatch.setattr(ai_agents, "_key", lambda: ("", ""))  # no model: every agent keeps its rule result
    monkeypatch.setattr(agents.telemetry, "record", lambda **e: e)


@pytest.mark.parametrize("headers", [{}, {"x-job-token": "wrong"}])
def test_stages_reject_missing_or_wrong_token(headers):
    assert client.post("/api/jobs/evidence/check", json={"run": "r", "agent": "fraud_hunter"}, headers=headers).status_code == 401


def test_stages_are_off_without_a_configured_token(monkeypatch):
    monkeypatch.delenv("INNGEST_JOB_TOKEN")
    assert client.post("/api/jobs/evidence/check", json={"run": "r", "agent": "fraud_hunter"}, headers=H).status_code == 503


def test_unknown_agent_is_rejected():
    assert client.post("/api/jobs/evidence/check", json={"run": "r", "agent": "nope"}, headers=H).status_code == 422


def test_stages_chain_into_a_saved_report():
    post = lambda stage, **body: client.post(f"/api/jobs/evidence/{stage}", json={"run": "r1", "user_id": "u", **body}, headers=H).json()
    assert post("check", agent="fraud_hunter")["findings"] == []
    assert post("review", agent="duplicate_detector", findings=[FINDING])["findings"][0]["title"] == FINDING["title"]
    scored = post("score", findings=post("web", findings=[FINDING])["findings"])
    assert scored["score"] == agents.risk_score([FINDING])
    v = post("verdict", findings=scored["findings"], score=scored["score"])
    assert v["verdict"] is None and v["error"]  # no model configured: the explanation is missing, the findings are not
    saved = post("save", findings=scored["findings"], score=scored["score"], summaries=[{"agent": "web_checker", "findings": 0, "ms": 1}], verdict=v["verdict"], source=v["source"], error=v["error"])
    assert saved == {"run": "r1", "risk_score": scored["score"], "risk_level": agents.risk_level(scored["score"]), "findings": 1}
