"""Round 2 (BUG-016/017/039/043): wallet screening distinguishes failures, never reads UNKNOWN/offline as all clear."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.crypto_bridge import upstream
from app.security import agents, ai_agents, chain_analyst, council

GOOD_LEGACY = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
BAD_CHECKSUM = "1Q8f6cESGGLkiExCwhnPCTzyLqmAUZg3Wv"
GOOD_BECH32 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
GOOD_TAPROOT = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
UNKNOWN = "DEMO-notindataset"


def test_valid_address_checks_the_checksum():
    assert chain_analyst.valid_address(GOOD_LEGACY) == GOOD_LEGACY
    assert chain_analyst.valid_address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")
    assert chain_analyst.valid_address(GOOD_BECH32) and chain_analyst.valid_address(GOOD_TAPROOT)
    assert chain_analyst.valid_address(UNKNOWN) == UNKNOWN
    assert chain_analyst.valid_address(BAD_CHECKSUM) is None
    assert chain_analyst.valid_address(GOOD_BECH32[:-1] + "p") is None  # bad bech32 checksum
    assert chain_analyst.valid_address(GOOD_LEGACY[:10] + "\n" + GOOD_LEGACY[10:]) is None


def _service(status: int, body=None):
    def handler(request):
        return httpx.Response(status, json=body if body is not None else {"status": "error"})

    upstream._transport = httpx.MockTransport(handler)


@pytest.fixture(autouse=True)
def _reset_transport():
    yield
    upstream._transport = None


@pytest.mark.parametrize("code,status", [(400, "rejected"), (429, "rate_limited"), (500, "offline"), (503, "offline")])
def test_non_200_is_not_reported_as_unreachable(code, status):
    _service(code)
    [r] = asyncio.run(chain_analyst.screen_wallets([GOOD_LEGACY]))
    assert r["status"] == status
    assert r["vote"] is None
    assert ("could not be reached" in r["reason"]) == (status == "offline")


def test_network_failure_is_offline():
    def boom(request):
        raise httpx.ConnectError("down")

    upstream._transport = httpx.MockTransport(boom)
    [r] = asyncio.run(chain_analyst.screen_wallets([GOOD_LEGACY]))
    assert r["status"] == "offline"


# --- BUG-017 ---------------------------------------------------------------------------------------------------------

FACTS = {"inc": 100000, "exp": 60000, "sr": 40, "nw": 500000, "hs": 70, "anchor": 10, "f": [], "nf": 0}


@pytest.fixture
def risk_council(monkeypatch):
    monkeypatch.setattr(council, "compact_facts", lambda user_id: dict(FACTS))
    monkeypatch.setattr(council, "get_settings", lambda: SimpleNamespace(nvidia_chat_api_key="", nvidia_council_model="m"))
    council._cache.clear()


def convene(wallets=None, lang="en"):
    async def go():
        return [e async for e in council.convene("u", wallets=wallets, lang=lang)]

    return asyncio.run(go())


def test_unknown_only_council_run_says_unverified(risk_council, monkeypatch):
    async def unknown(address, lang="en"):
        return {"status": "not_in_dataset", "verdict": "UNKNOWN", "engine": "networkx"}

    monkeypatch.setattr(chain_analyst, "check_wallet", unknown)
    v = convene([UNKNOWN])[-1]
    assert v["unverified"] == 1 and "unverified" in v["caveat"] and "not a safe signal" in v["caveat"]
    assert v["actions"][0] == chain_analyst.UNVERIFIED_CAVEAT
    plain = convene()[-1]
    assert "caveat" not in plain


@pytest.mark.parametrize("code", [429, 500])
def test_failed_council_run_is_unverified_and_not_cached(risk_council, code):
    _service(code)
    v = convene([GOOD_LEGACY])[-1]
    assert v["unverified"] == 1 and v["chain"]["voted"] is False
    assert convene([GOOD_LEGACY])[-1]["cached"] is False


def test_evidence_run_with_only_unverified_wallets_is_not_all_clear(monkeypatch):
    monkeypatch.setattr(agents.store, "query", lambda *a, **k: [])
    monkeypatch.setattr(agents.store, "put", lambda *a, **k: None)
    monkeypatch.setattr(ai_agents, "_key", lambda: ("", ""))
    _service(429)
    report = list(agents.investigate("u", pace=0, wallets=[GOOD_LEGACY]))[-1]["report"]
    text = json.dumps(report["verdict"]).lower()
    assert "unverified" in text and "all checks came back clean" not in text
    assert report["wallets_unverified"] == 1


# --- BUG-039 ---------------------------------------------------------------------------------------------------------


def test_council_cache_key_includes_lang_and_is_bounded(risk_council, monkeypatch):
    async def unknown(address, lang="en"):
        return {"status": "ok", "verdict": "ALLOW", "riskScore": 3, "engine": "networkx"}

    monkeypatch.setattr(chain_analyst, "check_wallet", unknown)
    assert convene([UNKNOWN], lang="hi")[-1]["cached"] is False
    assert convene([UNKNOWN], lang="hi")[-1]["cached"] is True
    assert convene([UNKNOWN], lang="en")[-1]["cached"] is False
    for i in range(council._CACHE_MAX + 40):
        council._cache_put(f"k{i}", {})
    assert len(council._cache) <= council._CACHE_MAX
