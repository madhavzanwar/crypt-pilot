from __future__ import annotations

import os

import pandas as pd
import pytest

from app.services.graph.base import GraphEngine, select_subgraph
from app.services.graph.networkx_engine import NetworkXEngine
from app.services.graph.tigergraph_engine import parse_khop_result

# S -> a -> x(illicit) ; b -> S ; b -> y(illicit, 2 hops) ; c (licit, 3 hops via y) ; z isolated
WALLETS = pd.DataFrame({
    "address": ["S", "a", "b", "x", "y", "c", "z"],
    "label": ["unknown", "licit", "unknown", "illicit", "illicit", "licit", "illicit"],
})
EDGES = pd.DataFrame({"src": ["S", "a", "b", "b", "y"], "dst": ["a", "x", "S", "y", "c"]})
GF = pd.DataFrame({"address": WALLETS["address"], "pagerank": 0.1, "comp_size": [6, 6, 6, 6, 6, 6, 1],
                   "in_deg": 0, "out_deg": 0})


def nx_engine(max_frontier: int = 5000) -> NetworkXEngine:
    return NetworkXEngine.from_frames(WALLETS, GF, EDGES, max_frontier)


def assert_engine_contract(engine: GraphEngine) -> None:
    assert engine.ping()
    assert engine.khop_exposure("missing", 3, 50) is None
    assert engine.get_wallet("missing") is None
    exp = engine.khop_exposure("S", 3, 50)
    assert exp is not None
    assert exp.subject.address == "S" and exp.subject.label == "unknown"
    assert (exp.counts[1].licit, exp.counts[1].unknown, exp.counts[1].illicit) == (1, 1, 0)  # a, b
    assert (exp.counts[2].illicit, exp.counts[2].licit) == (2, 0)  # x, y
    assert exp.counts[3].licit == 1  # c
    assert exp.nearest_illicit == 2
    ids = {n.id for n in exp.nodes}
    assert ids == {"S", "a", "b", "x", "y", "c"}
    assert "z" not in ids
    assert ("b", "S") in exp.links and ("S", "b") not in exp.links  # direction kept
    assert exp.elapsed_ms >= 0
    # subject excluded from its own counts; isolated wallet
    iso = engine.khop_exposure("z", 3, 50)
    assert iso is not None and iso.nearest_illicit is None
    assert sum(c.illicit + c.licit + c.unknown for c in iso.counts.values()) == 0


def test_networkx_engine_contract() -> None:
    assert_engine_contract(nx_engine())


def test_hop_limit_and_node_cap() -> None:
    e = nx_engine()
    one = e.khop_exposure("S", 1, 50)
    assert one is not None and one.nearest_illicit is None and set(one.counts) == {1}
    capped = e.khop_exposure("S", 3, 3)
    assert capped is not None and len(capped.nodes) <= 3
    assert capped.nodes[0].id == "S"


def test_frontier_cap_sets_truncated() -> None:
    exp = nx_engine(max_frontier=1).khop_exposure("S", 3, 50)
    assert exp is not None and exp.truncated


def test_select_subgraph_keeps_ancestors() -> None:
    parents: dict[str, str | None] = {"S": None, "a": "S", "x": "a", "b": "S"}
    assert select_subgraph(["S", "x", "b"], parents, 3) == ["S", "a", "x"]


def test_parse_tigergraph_output() -> None:
    result = [
        {"counts": {"h1:licit": 1, "h1:unknown": 1, "h2:illicit": 2, "h3:licit": 1},
         "nearest_illicit": 2, "truncated": False},
        {"nodes": [{"v_id": "S", "v_type": "Wallet", "attributes": {"address": "S", "label": "unknown", "hop": 0}},
                   {"v_id": "x", "v_type": "Wallet", "attributes": {"address": "x", "label": "illicit", "hop": 2}}]},
        {"edges": [{"e_type": "SENT_TO", "from_id": "b", "from_type": "Wallet", "to_id": "S", "to_type": "Wallet"}]},
    ]
    counts, nearest, truncated, nodes, links = parse_khop_result(result, 3)
    assert counts[2].illicit == 2 and counts[1].licit == 1
    assert nearest == 2 and not truncated
    assert [n.id for n in nodes] == ["S", "x"]
    assert links == [("b", "S")]
    _, none_nearest, *_ = parse_khop_result([{"counts": {}, "nearest_illicit": 9999}], 3)
    assert none_nearest is None


@pytest.mark.tigergraph
def test_tigergraph_matches_networkx_on_real_data() -> None:
    """Same processed data in both engines -> same evidence. Needs TG_* env and a loaded graph."""
    from app.config import Settings
    from app.services.graph.tigergraph_engine import TigerGraphEngine

    s = Settings()
    if not s.tg_configured or not (s.processed_dir / "edges.parquet").exists():
        pytest.skip("TigerGraph credentials or processed data not available")
    tg = TigerGraphEngine(s.tg_host, s.tg_graph, s.tg_secret.get_secret_value(), s.tg_username,
                          s.tg_password.get_secret_value(), s.tg_query_timeout_s)
    nxe = NetworkXEngine(s.processed_dir)
    sample = pd.read_parquet(s.processed_dir / "wallets.parquet", columns=["address"]).sample(
        5, random_state=int(os.environ.get("TG_TEST_SEED", "1")))["address"]
    for addr in sample:
        a, b = tg.khop_exposure(addr, 2, 50), nxe.khop_exposure(addr, 2, 50)
        assert a is not None and b is not None
        if not (a.truncated or b.truncated):
            assert a.counts == b.counts and a.nearest_illicit == b.nearest_illicit


def test_tigergraph_vertex_parameter_is_a_one_tuple() -> None:
    """Plain values for VERTEX<T> are deprecated and make pyTigerGraph reject then retry every call."""
    from app.services.graph.tigergraph_engine import TigerGraphEngine

    p = TigerGraphEngine.query_params("1Abc", 2, 60, 5000)
    assert p == {"seed": ("1Abc",), "max_hop": 2, "max_nodes": 60, "max_frontier": 5000}


def _bare_tg_engine(conn: object) -> object:
    import concurrent.futures as cf
    import threading

    from app.services.graph.tigergraph_engine import TigerGraphEngine

    e = TigerGraphEngine.__new__(TigerGraphEngine)
    e.conn, e._secret, e._token_ok, e._lock = conn, "", True, threading.Lock()
    e._pool, e.timeout_s, e.max_frontier, e.khop_gsql = cf.ThreadPoolExecutor(1), 5.0, 100, ""
    return e


def test_tigergraph_id_not_in_graph_is_none_not_an_engine_error() -> None:
    """Measured on a real TigerGraph 4.2.5 cluster: an unknown id raises error 601, not an empty list."""
    from app.services.graph.base import GraphEngineError

    class Conn:
        def __init__(self, exc: Exception) -> None:
            self.exc = exc

        def getVerticesById(self, *_a: object) -> list[object]:
            raise self.exc

    not_found = Exception("The input vertex id 'bc1p0x' is not a valid vertex id for vertex type = Wallet.", "601")
    assert _bare_tg_engine(Conn(not_found)).get_wallet("bc1p0x") is None  # type: ignore[attr-defined]
    assert _bare_tg_engine(Conn(not_found)).khop_exposure("bc1p0x", 2, 30) is None  # type: ignore[attr-defined]
    with pytest.raises(GraphEngineError):  # any other failure stays an error
        _bare_tg_engine(Conn(Exception("connection reset"))).get_wallet("x")  # type: ignore[attr-defined]
