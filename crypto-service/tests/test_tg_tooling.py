from __future__ import annotations

from dataclasses import replace

import pandas as pd
import pytest

from app.services.graph.base import Exposure, GraphEngineError, HopCounts
from app.services.graph.compare import compare_engines, hub_check, measure_latency, percentile
from app.services.graph.networkx_engine import NetworkXEngine
from app.services.graph.subset import select_subset
from tests.test_graph_engines import WALLETS, nx_engine


def test_percentile_nearest_rank() -> None:
    v = [float(i) for i in range(1, 101)]
    assert percentile(v, 50) == 50.0 and percentile(v, 95) == 95.0 and percentile(v, 100) == 100.0
    assert percentile([7.0], 95) == 7.0
    with pytest.raises(ValueError):
        percentile([], 50)


def test_identical_engines_agree() -> None:
    rep = compare_engines(nx_engine(), nx_engine(), list(WALLETS["address"]), 3, 50)
    assert rep["agree"] and rep["compared"] == len(WALLETS) and rep["diffs"] == []


class Perturbed:
    """Wraps an engine and corrupts one thing, to prove the comparison notices."""

    name = "networkx"

    def __init__(self, inner: NetworkXEngine, mode: str) -> None:
        self.inner, self.mode = inner, mode

    def ping(self) -> bool:
        return True

    def close(self) -> None:
        return None

    def get_wallet(self, address: str):  # type: ignore[no-untyped-def]
        return self.inner.get_wallet(address)

    def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
        e = self.inner.khop_exposure(address, max_hop, max_nodes)
        if e is None:
            return None
        if self.mode == "count":
            c = dict(e.counts)
            c[1] = HopCounts(illicit=c[1].illicit + 1, licit=c[1].licit, unknown=c[1].unknown)
            return replace(e, counts=c)
        if self.mode == "nearest":
            return replace(e, nearest_illicit=9)
        if self.mode == "missing":
            return None if address == "S" else e
        if self.mode == "truncated":
            return replace(e, truncated=True)
        raise AssertionError(self.mode)


@pytest.mark.parametrize(("mode", "field"), [("count", "counts"), ("nearest", "nearest_illicit"),
                                              ("missing", "exists")])
def test_comparison_detects_differences(mode: str, field: str) -> None:
    rep = compare_engines(nx_engine(), Perturbed(nx_engine(), mode), ["S"], 3, 50)  # type: ignore[arg-type]
    assert not rep["agree"] and field in {d["field"] for d in rep["diffs"]}


def test_truncated_results_are_reported_as_skipped_not_passed() -> None:
    rep = compare_engines(nx_engine(), Perturbed(nx_engine(), "truncated"), ["S", "a"], 3, 50)  # type: ignore[arg-type]
    assert rep["skipped_truncated"] == ["S", "a"] and rep["compared"] == 0


def test_engine_errors_are_recorded() -> None:
    class Down(Perturbed):
        def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
            raise GraphEngineError("timeout")

    rep = compare_engines(nx_engine(), Down(nx_engine(), "count"), ["S"], 3, 50)  # type: ignore[arg-type]
    assert not rep["agree"] and rep["errors"] == [{"address": "S", "error": "timeout"}]


def test_measure_latency_needs_50_calls_and_orders_percentiles() -> None:
    e = nx_engine()
    with pytest.raises(ValueError):
        measure_latency(e, ["S"], 10, 3, 50)
    r = measure_latency(e, list(WALLETS["address"]), 60, 3, 50)
    assert r["calls"] == 60 and r["errors"] == 0 and r["wall_ms"]["p50"] <= r["wall_ms"]["p95"]
    assert r["wall_ms"]["min"] <= r["wall_ms"]["p50"] and r["engine_reported_ms"]["p95"] >= 0


def test_hub_check_flags_truncation_and_errors() -> None:
    capped = hub_check(nx_engine(max_frontier=1), [("S", 2)], 3, 50, timeout_s=8)
    assert capped[0]["outcome"] == "ok" and capped[0]["truncated"] is True and capped[0]["hang"] is False

    class Down(Perturbed):
        def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
            raise GraphEngineError("timeout after 8s")

    rows = hub_check(Down(nx_engine(), "count"), [("S", 2)], 3, 50, timeout_s=8)  # type: ignore[arg-type]
    assert rows[0]["outcome"] == "engine_error" and "timeout" in rows[0]["error"]


# ---------------------------------------------------------------- budgeted subset
def _big() -> tuple[pd.DataFrame, pd.DataFrame]:
    n = 400
    labels = ["illicit"] * 20 + ["licit"] * 80 + ["unknown"] * 300
    w = pd.DataFrame({"address": [f"w{i}" for i in range(n)], "label": labels})
    import numpy as np

    rng = np.random.default_rng(3)
    src = rng.integers(0, n, 1200)
    dst = rng.integers(0, n, 1200)
    return w, pd.DataFrame({"src": [f"w{i}" for i in src], "dst": [f"w{i}" for i in dst]})


def test_subset_keeps_every_illicit_wallet_and_respects_budget() -> None:
    w, e = _big()
    kept, sub_e, tiers = select_subset(w, e, 100)
    assert len(kept) == 100
    assert set(w.loc[w["label"] == "illicit", "address"]) <= set(kept["address"])
    assert tiers["illicit"] == 20 and sum(tiers.values()) == 100
    keep = set(kept["address"])
    assert sub_e["src"].isin(keep).all() and sub_e["dst"].isin(keep).all()  # induced subgraph only


def test_subset_is_deterministic_and_seed_dependent() -> None:
    w, e = _big()
    a, _, _ = select_subset(w, e, 60, seed=1)
    b, _, _ = select_subset(w, e, 60, seed=1)
    c, _, _ = select_subset(w, e, 60, seed=2)
    assert list(a["address"]) == list(b["address"])  # same seed -> identical subset
    illicit = set(w.loc[w["label"] == "illicit", "address"])
    assert illicit <= set(a["address"]) and illicit <= set(c["address"])  # the core never depends on the seed
    assert set(a["address"]) != set(c["address"])  # the sampled tail does (budget cuts the 1-hop tier)


def test_subset_budget_smaller_than_illicit_samples_illicit_and_big_budget_keeps_all() -> None:
    w, e = _big()
    kept, _, tiers = select_subset(w, e, 10)
    assert len(kept) == 10 and tiers == {"illicit": 10}
    all_w, all_e, t = select_subset(w, e, 10_000)
    assert len(all_w) == len(w) and len(all_e) == len(e) and t == {"all": 400}


def test_subset_prefers_illicit_neighbourhood_over_random_wallets() -> None:
    w, e = _big()
    kept, _, tiers = select_subset(w, e, 120)
    assert tiers.get("illicit_neighbours_1hop", 0) > 0
    nbrs = set(e.loc[e["src"].isin(set(w.loc[w["label"] == "illicit", "address"])), "dst"]) | set(
        e.loc[e["dst"].isin(set(w.loc[w["label"] == "illicit", "address"])), "src"])
    assert len(set(kept["address"]) & nbrs) >= min(len(nbrs), 60)  # most 1-hop neighbours made it in


def test_demo_replay_never_touches_the_engine(tmp_path, trained) -> None:  # type: ignore[no-untyped-def]
    """DEMO_REPLAY=true must serve recorded REAL responses without any engine/network call (the offline demo)."""
    import json

    from fastapi.testclient import TestClient

    from app.main import build_state, create_app
    from app.services.graph.replay import ReplayStore
    from tests.test_api_check import make_settings

    addr = {w["expected"]: w["address"]
            for w in json.loads((trained[1] / "demo_wallets.json").read_text())["wallets"]}["BLOCK"]
    # 1) record a real response with the engine up
    s = make_settings(tmp_path, trained, starting_credits=5)
    with TestClient(create_app(s, build_state(s))) as c:
        real = c.post("/api/check", json={"address": addr, "lang": "en"}).json()
    store = ReplayStore(tmp_path / "replay")
    store.put(addr, "en", "2026-10-28T00:00:00+00:00", {k: v for k, v in real.items() if k != "creditsRemaining"})
    # 2) serve with DEMO_REPLAY=true and an engine that fails the test if it is ever called
    s2 = make_settings(tmp_path, trained, starting_credits=5, demo_replay=True)
    st = build_state(s2)
    assert st.pipeline is not None
    st.pipeline.replay = store

    def forbidden(*_: object) -> None:
        raise AssertionError("the graph engine must not be called in replay mode")

    st.pipeline.engine.khop_exposure = forbidden  # type: ignore[method-assign]
    with TestClient(create_app(s2, st)) as c:
        body = c.post("/api/check", json={"address": addr, "lang": "en"}).json()
    assert body["engine"] == "replay" and body["replay"] is True and body["verdict"] == real["verdict"]
    assert any("Pre-recorded" in x for x in body["limitations"])
