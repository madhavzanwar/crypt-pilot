"""Evidence Council AI review: per-agent models, annotation, and silent fallback."""
from types import SimpleNamespace

import pytest

from app.security import ai_agents


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    ai_agents._cache.clear()
    monkeypatch.setattr(ai_agents.telemetry, "record", lambda **e: e)  # keep the test run out of the real telemetry file


def _f(title="Possible double charge"):
    return {"agent": "duplicate_detector", "severity": "high", "title": title, "detail": "d", "merchant": "X", "amount": 10.0, "txn_ids": ["1"]}


def test_every_agent_has_a_model_chain_and_a_task_prompt():
    for agent, model in ai_agents.MODELS.items():
        assert model and ai_agents.BACKUPS[agent] != model
    assert set(ai_agents.ROLES) == {"duplicate_detector", "fraud_hunter", "subscription_sleuth", "pattern_analyst", "data_guardian", "web_checker", "risk_scorer"}


def test_notes_attached_per_finding(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    monkeypatch.setattr(ai_agents, "_post", lambda *a, **k: 'noise {"r":[{"i":0,"v":"doubt","n":"looks like a re-try"}]}')
    out, extra = ai_agents.review("duplicate_detector", [_f()], [])
    assert out[0]["ai"]["verdict"] == "doubt" and extra["ai"] == "ok" and extra["model"] == ai_agents.MODELS["duplicate_detector"]


def test_content_safety_adds_finding_for_unsafe_merchant(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    monkeypatch.setattr(ai_agents, "_post", lambda m, msgs, *a, **k: "User Safety: unsafe\nSafety Categories: Fraud" if "Scam" in msgs[0]["content"] else "User Safety: safe")
    rows = [SimpleNamespace(merchant=m, amount=-5, description="", id=m) for m in ("Scam Co", "Cafe")]
    out, _ = ai_agents.review("merchant_verifier", [], rows)
    assert [f["merchant"] for f in out] == ["Scam Co"]


def test_model_failure_keeps_rule_findings(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    def boom(*a, **k): raise RuntimeError("529")
    monkeypatch.setattr(ai_agents, "_post", boom)
    out, extra = ai_agents.review("fraud_hunter", [_f()], [])
    assert len(out) == 1 and "ai" not in out[0] and extra["ai"] == "error"


def test_agents_corroborate_each_other_and_ai_doubt_lowers_score():
    from app.security import agents
    a = {**_f(), "agent": "fraud_hunter", "severity": "medium", "merchant": "Swiggy"}
    b = {**_f(), "agent": "duplicate_detector", "severity": "medium", "merchant": "swiggy"}
    solo = {**_f(), "agent": "pattern_analyst", "severity": "medium", "merchant": "Other"}
    agents.cross_check([a, b, solo])
    assert a["severity"] == "high" and a["corroborated_by"] == ["duplicate_detector"] and "corroborated_by" not in solo and solo["severity"] == "medium"
    assert agents.risk_score([{**solo, "ai": {"verdict": "doubt"}}]) < agents.risk_score([solo])


def test_backup_model_used_when_primary_fails(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    calls = []
    def post(model, *a, **k):
        calls.append(model)
        if model == ai_agents.MODELS["duplicate_detector"]:
            raise RuntimeError("529")
        return '{"r":[{"i":0,"v":"confirm","n":"x"}]}'
    monkeypatch.setattr(ai_agents, "_post", post)
    out, extra = ai_agents.review("duplicate_detector", [_f()], [])
    assert calls[-1] == ai_agents.BACKUPS["duplicate_detector"] and out[0]["ai"]["verdict"] == "confirm" and extra["backup"] is True


def test_web_checker_attaches_answer_to_serious_merchants(monkeypatch):
    from app.api import web_router
    monkeypatch.setattr(ai_agents, "get_settings", lambda: type("S", (), {"tavily_api_key": "k"})())
    monkeypatch.setattr(web_router, "_call", lambda path, body, **k: {"answer": "Looks like a scam", "results": [{"url": "https://x", "content": "fraud warning"}]})
    monkeypatch.setattr(ai_agents, "ask_json", lambda *a, **k: ({"v": "scam", "n": "regulator warning"}, "m", False))
    hi, lo = {**_f(), "merchant": "Quick"}, {**_f(), "severity": "low", "merchant": "Calm"}
    ai_agents.web_evidence([hi, lo])
    assert hi["web"]["url"] == "https://x" and hi["web"]["verdict"] == "scam" and "web" not in lo


def test_risk_scorer_adjustment_is_clamped(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    monkeypatch.setattr(ai_agents, "ask_json", lambda *a, **k: ({"adj": 99, "why": "x"}, "m", False))
    score, extra = ai_agents.calibrate(50, [_f()])
    assert score == 60 and extra["adjust"] == 10


def test_no_findings_spends_no_tokens(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    def boom(*a, **k): raise AssertionError("model called")
    monkeypatch.setattr(ai_agents, "_post", boom)
    assert ai_agents.review("fraud_hunter", [], [])[1]["ai"] == "off"
    assert ai_agents.calibrate(0, [])[0] == 0


def test_telemetry_summary_counts_calls_and_never_stores_secrets(tmp_path, monkeypatch):
    from app import telemetry
    monkeypatch.undo()  # drop the autouse no-op so the real recorder runs
    monkeypatch.setattr(telemetry, "_FILE", tmp_path / "t.jsonl")
    telemetry._events.clear()
    telemetry.record(kind="call", key="NVIDIA_API_KEY", model="m", agent="a", ok=True, ms=100, tokens=50)
    telemetry.record(kind="call", key="NVIDIA_API_KEY", model="m", agent="a", ok=False, ms=300)
    s = telemetry.summary()
    assert s["by_key"][0]["calls"] == 2 and s["by_key"][0]["success"] == 50 and s["by_key"][0]["avg_ms"] == 200 and s["tokens"] == 50
    telemetry._events.clear()


def test_wrong_shape_answer_falls_through_to_backup(monkeypatch):
    monkeypatch.setattr(ai_agents, "_key", lambda: ("k", "K"))
    answers = iter(['{"headline": "x"}', '{"headline": "x", "what_is_wrong": "y", "what_to_do": ["z"]}'])
    monkeypatch.setattr(ai_agents, "_post", lambda *a, **k: next(answers))
    from app.security.agents import _Verdict
    data, model, backup = ai_agents.ask_json("verdict_writer", {"score": 1}, 100, system="s", check=_Verdict.model_validate)
    assert backup is True and model == ai_agents.BACKUPS["verdict_writer"] and data["what_to_do"] == ["z"]
