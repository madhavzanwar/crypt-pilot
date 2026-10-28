from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_state, create_app
from app.services.graph.base import GraphEngineError
from app.services.report_hash import canonical_json, keccak_hex


def make_settings(tmp_path: Path, trained: tuple[Path, Path], **kw: Any) -> Settings:
    processed, artifacts = trained
    ofac = tmp_path / "ofac.txt"
    ofac.write_text("DEMO-sanctioned1\n")
    base: dict[str, Any] = dict(
        _env_file=None, app_env="test", database_url=f"sqlite:///{tmp_path}/t.sqlite", data_dir=processed.parent,
        artifacts_dir=artifacts, ofac_list_path=ofac, graph_engine="networkx", demo_mode=True,
        session_secret="s", log_salt="l", starting_credits=3, cache_ttl_seconds=600)
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def make_client(tmp_path: Path, trained: tuple[Path, Path]) -> Iterator[Any]:
    clients: list[TestClient] = []

    def factory(**kw: Any) -> TestClient:
        s = make_settings(tmp_path, trained, **kw)
        c = TestClient(create_app(s, build_state(s)))
        c.__enter__()
        clients.append(c)
        return c

    yield factory
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def demo(trained: tuple[Path, Path]) -> dict[str, str]:
    wallets = json.loads((trained[1] / "demo_wallets.json").read_text())["wallets"]
    out = {}
    for w in wallets:
        out.setdefault(w["expected"], w["address"])
    return out


def credits(c: TestClient) -> int:
    return int(c.post("/api/check", json={"address": "DEMO-notindataset", "lang": "en"}).json()["creditsRemaining"])


def test_all_four_verdicts(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=10)
    for expected, addr in demo.items():
        r = c.post("/api/check", json={"address": addr, "lang": "en"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["verdict"] == expected
        assert body["engine"] == "networkx" and body["isMock"] is True
        assert body["chain"] == "bitcoin"
        assert body["explanation"]["en"] and body["explanation"]["hi"]
        assert any("not an accusation" in x for x in body["limitations"])
        if expected == "UNKNOWN":
            assert body["status"] == "not_in_dataset"
            assert "riskScore" in body and body["riskScore"] is None  # required-but-null kept
            assert body["datasetLabel"] is None
        else:
            assert body["status"] == "ok" and 0 <= body["riskScore"] <= 100
            nodes = body["subgraph"]["nodes"]
            assert nodes[0]["id"] == addr and nodes[0]["isSubject"] is True
            assert body["reportHash"].startswith("0x") and len(body["reportHash"]) == 66
            assert body["tigergraph"]["queryName"] == "networkx.khop_exposure"
            assert "gsql" not in body["tigergraph"]


def test_charging_rules(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=3)
    assert c.get("/api/health").status_code == 200
    r = c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"})
    assert r.json()["creditsRemaining"] == 2  # charged
    r = c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"})
    assert r.json()["cached"] is True and r.json()["creditsRemaining"] == 2  # cache hit is free
    r = c.post("/api/check", json={"address": "DEMO-notindataset", "lang": "en"})
    assert r.json()["status"] == "not_in_dataset" and r.json()["creditsRemaining"] == 2  # free


def test_error_is_not_charged(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=3, replay_fallback=False)
    p = c.app.state.cryptiq.pipeline

    def boom(*_: Any) -> None:
        raise GraphEngineError("down")

    p.engine.khop_exposure = boom
    r = c.post("/api/check", json={"address": demo["ALLOW"], "lang": "en"})
    assert r.status_code == 503 and r.json()["status"] == "error" and r.json()["error"] == "graph_unavailable"
    assert credits(c) == 3


def test_402_when_out_of_credits(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=1)
    assert c.post("/api/check", json={"address": demo["ALLOW"], "lang": "en"}).status_code == 200
    r = c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"})
    assert r.status_code == 402 and r.json() == {"error": "no_credits"}
    r = c.post("/api/check/stream", json={"address": demo["BLOCK"], "lang": "en"})
    assert r.status_code == 402 and r.json() == {"error": "no_credits"}


def test_concurrent_double_spend(tmp_path: Path, trained: tuple[Path, Path], demo: dict[str, str]) -> None:
    s = make_settings(tmp_path, trained, starting_credits=1)
    app = create_app(s, build_state(s))

    async def run() -> list[int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            await c.get("/api/health")  # get a session cookie
            reqs = [c.post("/api/check", json={"address": a, "lang": "en"}) for a in (demo["ALLOW"], demo["BLOCK"])]
            return sorted(r.status_code for r in await asyncio.gather(*reqs))

    assert asyncio.run(run()) == [200, 402]


@pytest.mark.parametrize(("address", "error"), [
    (" ".join(["abandon"] * 11 + ["about"]), "secret_input"),
    ("0x" + "ab" * 32, "secret_input"),
    ("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", "invalid_address"),
    ("hello", "invalid_address"),
])
def test_bad_input(make_client: Any, address: str, error: str) -> None:
    c = make_client()
    r = c.post("/api/check", json={"address": address, "lang": "en"})
    assert r.status_code == 400 and r.json() == {"error": error}
    assert address not in r.text


def test_demo_addresses_rejected_outside_demo_mode(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(demo_mode=False)
    assert c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"}).json() == {"error": "invalid_address"}


def test_ofac_forces_block_even_outside_dataset(make_client: Any) -> None:
    body = make_client().post("/api/check", json={"address": "DEMO-sanctioned1", "lang": "hi"}).json()
    assert body["verdict"] == "BLOCK" and body["labelHits"]["ofac"] is True
    assert body["status"] == "not_in_dataset" and body["riskScore"] is None
    assert body["topReasons"][0] == "OFAC प्रतिबंध सूची में शामिल है"


def test_stream_steps_then_result(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client()
    with c.stream("POST", "/api/check/stream", json={"address": demo["WARN"], "lang": "en"}) as r:
        assert r.status_code == 200
        text = "".join(r.iter_text())
    events = [(blk.split("\n")[0].removeprefix("event: ").strip(), blk) for blk in text.replace("\r", "").split("\n\n")
              if blk.startswith("event:")]
    steps = [json.loads(b.split("data: ", 1)[1])["id"] for e, b in events if e == "step"]
    assert steps == ["validate", "graph", "hops", "score", "explain"]
    result = [json.loads(b.split("data: ", 1)[1]) for e, b in events if e == "result"]
    assert len(result) == 1 and result[0]["verdict"] == "WARN" and result[0]["creditsRemaining"] == 2


def test_replay_fallback(make_client: Any, demo: dict[str, str], trained: tuple[Path, Path], tmp_path: Path) -> None:
    from app.services.graph.replay import ReplayStore

    c = make_client(artifacts_dir=trained[1])
    p = c.app.state.cryptiq.pipeline
    real = c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"}).json()
    store = ReplayStore(tmp_path / "replay")
    store.put(demo["BLOCK"], "en", "2026-10-28T00:00:00+00:00", {k: v for k, v in real.items() if k != "creditsRemaining"})
    p.replay = store
    p.cache = type(p.cache)(600)

    def boom(*_: Any) -> None:
        raise GraphEngineError("down")

    p.engine.khop_exposure = boom
    body = c.post("/api/check", json={"address": demo["BLOCK"], "lang": "en"}).json()
    assert body["engine"] == "replay" and body["replay"] is True and body["verdict"] == real["verdict"]
    assert any("Pre-recorded" in x for x in body["limitations"])


def test_demo_wallets_endpoint(make_client: Any) -> None:
    wallets = make_client().get("/api/demo-wallets").json()["wallets"]
    assert {w["expected"] for w in wallets} == {"ALLOW", "WARN", "BLOCK", "UNKNOWN"}


def test_report_hash_vectors() -> None:
    assert keccak_hex(canonical_json({})) == "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d"
    assert canonical_json({"b": [True, None, "x"], "a": 1}) == '{"a":1,"b":[true,null,"x"]}'
    assert keccak_hex('{"a":1,"b":[true,null,"x"]}') == \
        "0x339e8a1d3314cd7f250bf6a7a3cdf2eda788cf4e5314d1ba2b131b4b4d93daad"
    assert canonical_json({"hi": "जोखिम"}) == '{"hi":"जोखिम"}'
    with pytest.raises(TypeError):
        canonical_json({"x": 0.1})
