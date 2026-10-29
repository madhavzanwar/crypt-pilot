"""BUG-016 remainder: a bad-checksum wallet is kept as a 'rejected' entry (unverified), never silently dropped."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.api import security_router
from app.security import agents, ai_agents, chain_analyst, council
from tests.test_round2_security import BAD_CHECKSUM, FACTS, GOOD_LEGACY, _reset_transport, _service  # noqa: F401


@pytest.fixture
def risk_council(monkeypatch):
    monkeypatch.setattr(council, "compact_facts", lambda user_id: dict(FACTS))
    monkeypatch.setattr(council, "get_settings", lambda: SimpleNamespace(nvidia_chat_api_key="", nvidia_council_model="m"))
    council._cache.clear()


def convene(wallets, rejected):
    async def go():
        return [e async for e in council.convene("u", wallets=wallets, rejected=rejected)]

    return asyncio.run(go())


def test_router_splits_bad_checksum_but_never_echoes_junk():
    body = security_router.Screening(wallets=[GOOD_LEGACY, BAD_CHECKSUM, "word " * 6, "not-an-address"])
    wallets, _, note, bad = security_router._wallets(body)
    assert wallets == [GOOD_LEGACY] and bad == [BAD_CHECKSUM]
    assert "word" not in json.dumps([note, bad])


def test_rejected_only_council_is_unverified_with_chain_entry(risk_council):
    events = convene([], [BAD_CHECKSUM])
    vote = next(e["vote"] for e in events if e["type"] == "vote" and e["vote"]["agent"] == chain_analyst.AGENT_ID)
    [entry] = vote["chain"]["wallets"]
    assert entry["status"] == "rejected" and entry["address"] == BAD_CHECKSUM and "invalid checksum / format" in entry["reason"].lower()
    v = events[-1]
    assert v["unverified"] == 1 and v["chain"]["wallets"] == 1 and v["chain"]["rejected"] == 1 and v["chain"]["voted"] is False
    assert "unverified" in v["caveat"] and v["actions"][0] == chain_analyst.UNVERIFIED_CAVEAT


def test_mixed_council_keeps_valid_verdict_and_counts_rejected(risk_council):
    _service(500)
    v = convene([GOOD_LEGACY], [BAD_CHECKSUM])[-1]
    assert v["chain"]["wallets"] == 2 and v["unverified"] == 2


def test_evidence_run_with_only_rejected_wallet_is_not_all_clear(monkeypatch):
    monkeypatch.setattr(agents.store, "query", lambda *a, **k: [])
    monkeypatch.setattr(agents.store, "put", lambda *a, **k: None)
    monkeypatch.setattr(ai_agents, "_key", lambda: ("", ""))
    events = list(agents.investigate("u", pace=0, wallets=[], rejected=[BAD_CHECKSUM]))
    step = next(e for e in events if e.get("agent") == chain_analyst.AGENT_ID and e.get("status") == "done")
    assert step["unverified"] == 1 and step["rejected"][0]["status"] == "rejected"
    report = events[-1]["report"]
    assert report["wallets_unverified"] == 1 and "all checks came back clean" not in json.dumps(report["verdict"]).lower()
    assert "unverified" in json.dumps(report["verdict"]).lower()
