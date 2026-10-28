"""Chain Analyst: wallet screening in the Risk Council and the Evidence Council. `check_wallet` is always faked (no network)
and the store is faked too, so these tests need neither the crypto service nor the Firestore emulator."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.security import agents, ai_agents, chain_analyst, council

BLOCK_ADDR = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
WARN_ADDR = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
ALLOW_ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
UNKNOWN_ADDR = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"


def resp(verdict, score=None, hops=None, ofac=False, engine="tigergraph", ms=12, reasons=(), status="ok", label=None):
    return {
        "status": status, "address": "x", "chain": "bitcoin", "verdict": verdict, "riskScore": score,
        "datasetLabel": label, "hopsToNearestIllicit": hops, "labelHits": {"ofac": ofac, "ransomwhere": False},
        "topReasons": list(reasons), "tigergraph": {"queryName": "q", "ms": ms}, "engine": engine,
        "explanation": {"en": "e", "hi": "h"}, "limitations": ["Elliptic++ is a research dataset."],
    }


ANSWERS = {
    BLOCK_ADDR: resp("BLOCK", 91, hops=1, ofac=True, reasons=["Sent funds to a sanctioned wallet"]),
    WARN_ADDR: resp("WARN", 48, hops=2),
    ALLOW_ADDR: resp("ALLOW", 8, hops=None),
    UNKNOWN_ADDR: resp("UNKNOWN", None, status="not_in_dataset"),
}


@pytest.fixture
def service(monkeypatch):
    """Fake crypto service answering from ANSWERS; records every call."""
    calls: list[str] = []

    async def fake(address, lang="en"):
        calls.append(address)
        return ANSWERS.get(address)

    monkeypatch.setattr(chain_analyst, "check_wallet", fake)
    return calls


def screen(*wallets):
    return asyncio.run(chain_analyst.screen_wallets(list(wallets)))


# --- the vote mapping ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("addr,verdict,vote,level", [
    (BLOCK_ADDR, "BLOCK", "high", "high"),
    (WARN_ADDR, "WARN", "medium", "medium"),
    (ALLOW_ADDR, "ALLOW", "low", "low"),
])
def test_verdicts_map_to_council_levels(service, addr, verdict, vote, level):
    [r] = screen(addr)
    assert (r["verdict"], r["vote"]) == (verdict, vote)
    v = chain_analyst.council_vote([r])
    assert v["level"] == level and v["abstain"] is False
    assert council.level(v["score"]) == level  # the score sits inside the council band for that level
    assert v["agent"] == "chain_analyst" and v["name"] == "Chain Analyst" and v["source"] == "graph"


def test_block_finding_carries_everything_the_council_shows(service):
    [r] = screen(BLOCK_ADDR)
    f = chain_analyst.wallet_finding(r)
    assert f["agent"] == "chain_analyst" and f["severity"] == "high" and f["info"] is False
    assert f["txn_ids"] == [] and f["amount"] == 0 and f["merchant"] is None  # native finding keys
    c = f["chain"]
    assert (c["verdict"], c["risk_score"], c["hops"], c["ofac"], c["engine"], c["tigergraph"], c["ms"]) == ("BLOCK", 91, 1, True, "tigergraph", True, 12)
    assert "OFAC" in r["reason"] and "TigerGraph" in f["detail"] and "12 ms" in f["detail"]


def test_warn_is_medium_and_allow_is_low_but_informational(service):
    warn, allow = screen(WARN_ADDR, ALLOW_ADDR)
    fw, fa = chain_analyst.wallet_finding(warn), chain_analyst.wallet_finding(allow)
    assert (fw["severity"], fw["info"]) == ("medium", False)
    assert (fa["severity"], fa["info"]) == ("low", True)  # shown, never counted in the risk score


def test_unknown_abstains_and_says_not_in_dataset_is_not_safe(service):
    [r] = screen(UNKNOWN_ADDR)
    assert r["vote"] is None and r["status"] == "not_in_dataset"
    assert "not in dataset" in r["reason"].lower() and "not a safe signal" in r["reason"]
    v = chain_analyst.council_vote([r])
    assert v["abstain"] is True and v["level"] == "abstain" and "does not mean safe" in v["why"]
    f = chain_analyst.wallet_finding(r)
    assert f["info"] is True and "not in dataset" in f["title"]


def test_worst_verdict_decides_and_unknown_is_reported(service):
    results = screen(ALLOW_ADDR, BLOCK_ADDR, UNKNOWN_ADDR)
    v = chain_analyst.council_vote(results)
    assert v["level"] == "high" and "1 not in dataset" in v["why"] and "2 other wallets" in v["why"]
    assert v["do"].startswith("Do not send funds to")


# --- honesty about the engine -------------------------------------------------------------------------------------


def test_tigergraph_is_named_only_when_the_engine_is_tigergraph(monkeypatch, service):
    ANSWERS_BAK = dict(ANSWERS)
    ANSWERS[WARN_ADDR] = resp("WARN", 48, hops=2, engine="networkx", reasons=["TigerGraph says it is near a mixer"])
    try:
        [r] = screen(WARN_ADDR)
    finally:
        ANSWERS.update(ANSWERS_BAK)
    f = chain_analyst.wallet_finding(r)
    assert r["tigergraph"] is False and r["engine_label"] == "NetworkX fallback"
    assert "tigergraph" not in (f["detail"] + f["title"] + r["reason"]).lower()
    assert "NetworkX fallback" in f["detail"]


# --- offline ------------------------------------------------------------------------------------------------------


def test_offline_service_abstains_with_a_clear_message(monkeypatch):
    async def down(address, lang="en"):
        return None

    monkeypatch.setattr(chain_analyst, "check_wallet", down)
    results = screen(BLOCK_ADDR, WARN_ADDR)
    assert {r["status"] for r in results} == {"offline"} and all(chain_analyst.wallet_finding(r) is None for r in results)
    v = chain_analyst.council_vote(results)
    assert v["abstain"] is True and "Chain Analyst offline" in v["why"]
    findings, extra = chain_analyst.evidence_step([BLOCK_ADDR, WARN_ADDR])
    assert findings == [] and extra["error"] == "Chain Analyst offline" and extra["findings"] == 0 and extra["screened"] == 0


def test_a_check_wallet_that_raises_is_treated_as_offline(monkeypatch):
    async def boom(address, lang="en"):
        raise RuntimeError("boom")

    monkeypatch.setattr(chain_analyst, "check_wallet", boom)
    [r] = screen(BLOCK_ADDR)
    assert r["status"] == "offline"


def test_error_status_response_counts_as_unavailable(monkeypatch):
    async def err(address, lang="en"):
        return resp("UNKNOWN", status="error")

    monkeypatch.setattr(chain_analyst, "check_wallet", err)
    assert screen(BLOCK_ADDR)[0]["status"] == "offline"


# --- wallet input -------------------------------------------------------------------------------------------------


def test_clean_wallets_validates_dedupes_and_caps_at_five():
    seed = "abandon ability able about above absent absorb abstract absurd abuse access accident"
    ok, rejected = chain_analyst.clean_wallets([BLOCK_ADDR, BLOCK_ADDR, "  " + WARN_ADDR + " ", seed, "not-an-address", "0x" + "a" * 64])
    assert ok == [BLOCK_ADDR, WARN_ADDR] and rejected == 3
    many = [f"DEMO-wallet-{i}" for i in range(8)]
    ok, rejected = chain_analyst.clean_wallets(many)
    assert len(ok) == 5 and rejected == 3
    assert chain_analyst.clean_wallets(None) == ([], 0)
    assert chain_analyst.clean_wallets(["bc1QAR0SRRR7xfkvy5l643lydnw9re59gtzzwf5mdq"])[1] == 1  # mixed-case bech32 is invalid


# --- Risk Council --------------------------------------------------------------------------------------------------

FACTS = {"inc": 100000, "exp": 60000, "sr": 40, "nw": 500000, "hs": 70, "anchor": 10, "f": [], "nf": 0}


@pytest.fixture
def risk_council(monkeypatch):
    monkeypatch.setattr(council, "compact_facts", lambda user_id: dict(FACTS))
    monkeypatch.setattr(council, "get_settings", lambda: SimpleNamespace(nvidia_chat_api_key="", nvidia_council_model="m"))
    council._cache.clear()


def convene(wallets=None):
    async def go():
        return [e async for e in council.convene("u", wallets=wallets)]

    return asyncio.run(go())


def test_council_without_wallets_never_calls_the_crypto_service(risk_council, monkeypatch):
    async def forbidden(*a, **k):
        raise AssertionError("check_wallet must not be called without wallets")

    monkeypatch.setattr(chain_analyst, "check_wallet", forbidden)
    events = convene()
    verdict = events[-1]
    assert len([e for e in events if e["type"] == "vote"]) == 7 and "chain" not in verdict
    assert all(v["agent"] != "chain_analyst" for v in verdict["votes"])


def test_council_with_a_blocked_wallet_adds_an_eighth_vote_that_counts(risk_council, service):
    base = convene()[-1]
    council._cache.clear()
    events = convene([BLOCK_ADDR])
    verdict = events[-1]
    chain = [e["vote"] for e in events if e["type"] == "vote" and e["vote"]["agent"] == "chain_analyst"]
    assert len(chain) == 1 and chain[0]["level"] == "high" and len(verdict["votes"]) == 8
    assert sum(verdict["counts"].values()) == 8 and verdict["counts"]["high"] == base["counts"].get("high", 0) + 1
    assert verdict["chain"] == {"wallets": 1, "voted": True, "offline": False}
    assert any(a.startswith("Do not send funds") for a in verdict["actions"]) or len(verdict["actions"]) == 3
    assert service == [BLOCK_ADDR]


def test_council_abstention_is_listed_but_not_counted(risk_council, service):
    base = convene()[-1]
    council._cache.clear()
    verdict = convene([UNKNOWN_ADDR])[-1]
    assert len(verdict["votes"]) == 8 and sum(verdict["counts"].values()) == 7
    assert (verdict["score"], verdict["counts"]) == (base["score"], base["counts"])  # the existing seven are unaffected
    assert verdict["chain"]["voted"] is False
    assert all(d["agent"] != "chain_analyst" for d in verdict["dissent"])


def test_council_offline_abstains_and_is_not_cached(risk_council, monkeypatch):
    async def down(address, lang="en"):
        return None

    monkeypatch.setattr(chain_analyst, "check_wallet", down)
    verdict = convene([BLOCK_ADDR])[-1]
    vote = next(v for v in verdict["votes"] if v["agent"] == "chain_analyst")
    assert vote["abstain"] and "Chain Analyst offline" in vote["why"] and verdict["chain"]["offline"] is True
    assert convene([BLOCK_ADDR])[-1]["cached"] is False  # an outage is not remembered


def test_tally_ignores_abstentions():
    votes = [council._vote(str(i), f"A{i}", s, "w", "", "rules", 1) for i, s in enumerate([10, 20, 80])]
    votes.append({**chain_analyst.council_vote([chain_analyst.summarise(UNKNOWN_ADDR, None)]), "do": ""})
    t = council.tally(votes)
    assert t["score"] == 20 and sum(t["counts"].values()) == 3 and len(t["votes"]) == 4


# --- Evidence Council ----------------------------------------------------------------------------------------------


@pytest.fixture
def ledger(monkeypatch):
    monkeypatch.setattr(agents.store, "query", lambda *a, **k: [])
    monkeypatch.setattr(agents.store, "put", lambda *a, **k: None)
    monkeypatch.setattr(agents.time, "sleep", lambda s: None)
    monkeypatch.setattr(ai_agents, "_key", lambda: ("", ""))


def investigate(wallets=None):
    return list(agents.investigate("u", pace=0, wallets=wallets))


def test_evidence_without_wallets_runs_the_nine_agents_unchanged(ledger, monkeypatch):
    async def forbidden(*a, **k):
        raise AssertionError("check_wallet must not be called without wallets")

    monkeypatch.setattr(chain_analyst, "check_wallet", forbidden)
    report = investigate()[-1]["report"]
    assert [a["agent"] for a in report["agents"]] == [k for k, _, _ in agents.AGENTS]
    assert "wallets_screened" not in report and all(f["agent"] != "chain_analyst" for f in report["findings"])


def test_evidence_with_wallets_adds_one_finding_per_wallet_before_the_risk_scorer(ledger, service):
    events = investigate([BLOCK_ADDR, WARN_ADDR, ALLOW_ADDR, UNKNOWN_ADDR])
    order = [e["agent"] for e in events if e["type"] == "agent" and e["status"] == "done"]
    assert order.index("chain_analyst") == order.index("risk_scorer") - 1 and len(order) == 10
    report = events[-1]["report"]
    mine = [f for f in report["findings"] if f["agent"] == "chain_analyst"]
    assert [f["chain"]["verdict"] for f in mine] == ["BLOCK", "WARN", "ALLOW", "UNKNOWN"]
    summary = next(a for a in report["agents"] if a["agent"] == "chain_analyst")
    assert summary["findings"] == 2 and summary["wallets"] == 4 and summary["screened"] == 4 and summary["tigergraph"] is True
    assert report["wallets_screened"] == [BLOCK_ADDR, WARN_ADDR, ALLOW_ADDR, UNKNOWN_ADDR]
    # only BLOCK (high=20) and WARN (medium=8) are scored: ALLOW and UNKNOWN are informational
    assert report["risk_score"] == 28


def test_evidence_clean_and_unknown_wallets_do_not_raise_the_score(ledger, service):
    report = investigate([ALLOW_ADDR, UNKNOWN_ADDR])[-1]["report"]
    assert report["risk_score"] == 0 and len([f for f in report["findings"] if f["agent"] == "chain_analyst"]) == 2
    assert report["verdict"]["headline"] == "No security problems found."


def test_evidence_offline_service_abstains(ledger, monkeypatch):
    async def down(address, lang="en"):
        return None

    monkeypatch.setattr(chain_analyst, "check_wallet", down)
    report = investigate([BLOCK_ADDR])[-1]["report"]
    summary = next(a for a in report["agents"] if a["agent"] == "chain_analyst")
    assert summary["error"] == "Chain Analyst offline" and summary["findings"] == 0
    assert not [f for f in report["findings"] if f["agent"] == "chain_analyst"] and report["risk_score"] == 0


# --- HTTP routes -----------------------------------------------------------------------------------------------------


def test_routes_accept_wallets_and_stay_backwards_compatible(risk_council, service, monkeypatch):
    import json

    from fastapi.testclient import TestClient

    from app.ingest.seed import seed_if_empty
    from app.main import app

    seed_if_empty()
    client = TestClient(app)
    # The body is optional: an empty POST still convenes the plain seven-agent council.
    plain = [json.loads(line) for line in client.post("/api/security/demo-meera/council").text.splitlines() if line]
    assert plain[-1]["type"] == "verdict" and "chain" not in plain[-1]
    council._cache.clear()
    lines = client.post("/api/security/demo-meera/council", json={"wallets": [BLOCK_ADDR, "junk text"]}).text.splitlines()
    verdict = json.loads(lines[-1])
    assert verdict["chain"]["wallets"] == 1 and len(verdict["votes"]) == 8  # junk is dropped, never sent to the service
    assert service == [BLOCK_ADDR]
    # Twin Simulator: one hypothetical payment to a wallet.
    sim = client.post("/api/security/demo-meera/simulate-fraud", json={"merchant": "Local cafe", "amount": 100, "wallet": WARN_ADDR})
    assert sim.status_code == 200
    body = sim.json()
    assert body["wallet"]["verdict"] == "WARN" and any(f["agent"] == "chain_analyst" for f in body["findings"]) and body["caught"] is True
    allow = client.post("/api/security/demo-meera/simulate-fraud", json={"merchant": "Local cafe", "amount": 100, "wallet": ALLOW_ADDR}).json()
    assert allow["wallet"]["verdict"] == "ALLOW" and not any(f["agent"] == "chain_analyst" for f in allow["findings"])
    bad = client.post("/api/security/demo-meera/simulate-fraud", json={"merchant": "Local cafe", "amount": 100, "wallet": "not a wallet"})
    assert bad.status_code == 422


# --- review fixes ---------------------------------------------------------------------------------------------------


def test_a_blocked_wallet_cannot_be_buried_by_a_calm_median(risk_council, service):
    """Seven money agents can all sound relaxed; one flagged wallet is still a hard stop."""
    base = convene()[-1]
    council._cache.clear()
    verdict = convene([BLOCK_ADDR])[-1]
    assert verdict["score"] >= max(base["score"], 50) and verdict["level"] == "high"
    assert verdict["actions"][0].startswith("Do not send funds")


def test_a_malformed_service_reply_does_not_break_the_council_or_the_investigation(risk_council, monkeypatch):
    async def junk(address, lang="en"):
        return {"status": "ok", "verdict": "BLOCK", "riskScore": float("nan"), "labelHits": [], "tigergraph": None}

    monkeypatch.setattr(chain_analyst, "check_wallet", junk)
    verdict = convene([BLOCK_ADDR])[-1]  # must still produce a verdict
    assert verdict["type"] == "verdict" and verdict["chain"]["wallets"] == 1
    monkeypatch.setattr(chain_analyst, "_evidence_step", lambda w, lang="en": (_ for _ in ()).throw(RuntimeError("boom")))
    assert chain_analyst.evidence_step([BLOCK_ADDR]) == ([], {"error": chain_analyst.OFFLINE_NOTE, "findings": 0})
