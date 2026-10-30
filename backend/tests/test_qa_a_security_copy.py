"""QA3-5/7/8, QA2-11: Evidence/Risk Council honesty and Twin simulator input validation."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.security import agents, ai_agents, chain_analyst

client = TestClient(app)


def _res(addr, verdict, score):
    return {"address": addr, "status": "ok" if verdict != "UNKNOWN" else "not_in_dataset", "verdict": verdict, "risk_score": score,
            "reason": "r", "vote": {"BLOCK": "high", "WARN": "medium", "ALLOW": "low"}.get(verdict)}


def test_block_advice_names_every_blocked_wallet():
    vote = chain_analyst.council_vote([_res("DEMO-w02271", "BLOCK", 100), _res("DEMO-w00308", "BLOCK", 90), _res("DEMO-w01391", "ALLOW", 0)])
    assert "DEMO-w02271" in vote["do"] and "DEMO-w00308" in vote["do"] and "DEMO-w01391" not in vote["do"]


def test_unknown_only_wallets_abstain_with_unverified_action():
    vote = chain_analyst.council_vote([_res("DEMO-notindataset", "UNKNOWN", None)])
    assert vote["abstain"] is True and "not safe" in vote["why"].lower() or "does not mean safe" in vote["why"]


def test_rule_based_run_names_no_model(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: (None, None))
    _, extra = ai_agents.review("fraud_hunter", [], [], [], None)
    assert "model" not in extra and extra["ai"] == "off"
    score, extra = ai_agents.calibrate(100, [{"severity": "high"}], None)
    assert score == 100 and "model" not in extra


def test_verdict_error_has_no_leading_period(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: (None, None))
    _, _, err = agents.write_verdict([{"severity": "high", "title": "t", "detail": "d", "agent": "a", "amount": 1, "merchant": "m"}], 80, None)
    assert err and not err.startswith(".") and ". ." not in err


def test_risk_scorer_summary_carries_the_level():
    assert agents.risk_level(100) in ("critical", "high")


def test_twin_rejects_empty_merchant_and_non_positive_amounts():
    base = "/api/security/demo-priya/simulate-fraud"
    assert client.post(base, json={"merchant": "   ", "amount": 100}).status_code == 422
    r = client.post(base, json={"merchant": "Shop", "amount": -50})
    assert r.status_code == 422 and "above zero" in r.text
    assert client.post(base, json={"merchant": "Shop", "amount": 0}).status_code == 422
    assert client.post(base, json={"merchant": "Shop", "amount": 1e20}).status_code == 422
    ok = client.post(base, json={"merchant": "Shop", "amount": 100})
    assert ok.status_code == 200 and ok.json()["outcome"] in ("caught", "not_flagged")


def test_twin_unknown_wallet_is_unverified_not_normal():
    r = client.post("/api/security/demo-priya/simulate-fraud", json={"merchant": "Crypto Shop", "amount": 100, "wallet": "DEMO-notindataset"})
    assert r.status_code == 200
    if not r.json()["caught"]:
        assert r.json()["outcome"] == "unverified"
