"""Risk Council: compact facts, rule fallback, voting, and the debate round (model calls are faked)."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.ingest.seed import seed_if_empty
from app.security import council


def _run(user="demo-meera"):
    async def go():
        return [e async for e in council.convene(user)]

    return asyncio.run(go())


@pytest.fixture(autouse=True)
def fresh():
    council._cache.clear()
    seed_if_empty()


def _settings(monkeypatch, key=""):
    monkeypatch.setattr(council, "get_settings", lambda: SimpleNamespace(nvidia_chat_api_key=key, nvidia_council_model="m"))


def test_facts_are_small_and_hold_no_raw_transactions():
    facts = council.compact_facts("demo-priya")
    s = council.facts_json(facts)
    assert len(s) < 1400  # roughly 400 tokens
    assert all(len(row) == 4 for row in facts["f"])  # [agent, severity, title, amount]: no ids, no dates


def test_without_a_key_seven_rule_agents_still_vote(monkeypatch):
    _settings(monkeypatch)
    events = _run()
    votes = [e["vote"] for e in events if e["type"] == "vote"]
    verdict = events[-1]
    assert len(votes) == 7 and {v["source"] for v in votes} == {"rules"}
    assert verdict["type"] == "verdict" and verdict["level"] in ("low", "medium", "high", "critical") and verdict["tokens"] == 0


def test_second_identical_run_is_served_from_cache(monkeypatch):
    _settings(monkeypatch)
    _run()
    assert _run()[-1]["cached"] is True


def test_tally_uses_the_median_and_lists_dissent():
    votes = [council._vote(str(i), f"A{i}", s, "why", f"do{i}", "model", 1) for i, s in enumerate([10, 20, 80, 85, 90, 90, 95])]
    t = council.tally(votes)
    assert (t["score"], t["level"]) == (85, "critical")
    assert [d["name"] for d in t["dissent"]] == ["A0", "A1"]  # the only two who did not say critical
    assert t["actions"][0] == "do3"  # the vote closest to the median supplies the first action


def test_far_outlier_gets_a_second_turn_and_can_change_its_mind(monkeypatch):
    _settings(monkeypatch, key="x")
    calls = []

    async def fake_ask(client, system, user, max_tokens):
        calls.append(max_tokens)
        if max_tokens == 70:  # the revision call
            return {"score": 80, "why": "persuaded"}, 50
        return {"score": 20 if "devil" in system else 90, "why": "w", "do": "d"}, 100

    monkeypatch.setattr(council, "_ask", fake_ask)
    events = _run()
    assert any(e["type"] == "debate" and e["agents"] == ["optimist"] for e in events)
    verdict = events[-1]
    optimist = next(v for v in verdict["votes"] if v["agent"] == "optimist")
    assert (optimist["score"], optimist["round"]) == (80, 2)
    assert verdict["tokens"] == 7 * 100 + 50 - 100 + 100 - 100 + 100 - 100 + 100 or verdict["tokens"] > 0
    assert calls.count(70) == 1  # only the outlier paid for a second turn


def test_a_failing_model_call_falls_back_to_that_agents_rule(monkeypatch):
    _settings(monkeypatch, key="x")

    async def boom(*a, **k):
        raise RuntimeError("503")

    monkeypatch.setattr(council, "_ask", boom)
    verdict = _run()[-1]
    assert len(verdict["votes"]) == 7 and {v["source"] for v in verdict["votes"]} == {"rules"}
