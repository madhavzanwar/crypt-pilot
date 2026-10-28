from __future__ import annotations

from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
import pytest

from app.services.datasets.processing import (
    GRAPH_FEATURE_COLUMNS,
    assign_splits,
    build_edges,
    build_wallets,
    check_schema,
    graph_features,
    index_graph,
    pagerank,
    read_raw,
)
from scripts.make_fixture import make_fixture


@pytest.fixture(scope="module")
def raw(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("raw")
    make_fixture(out, n_wallets=600, seed=3)
    return out


def _tiny() -> tuple[pd.DataFrame, pd.DataFrame]:
    # a - b - c - d chain plus e isolated; b->a is a reciprocal edge
    wallets = pd.DataFrame({"address": list("abcde"),
                            "label": ["illicit", "licit", "illicit", "unknown", "licit"]})
    edges = pd.DataFrame({"src": ["a", "b", "b", "c"], "dst": ["b", "a", "c", "d"]})
    return wallets, edges


def test_fixture_matches_schema(raw: Path) -> None:
    assert check_schema(*read_raw(raw)) == []


def test_build_wallets_dedupes_and_maps_labels(raw: Path) -> None:
    feats, classes, _ = read_raw(raw)
    w = build_wallets(feats, classes)
    assert w["address"].is_unique
    assert len(w) == classes["address"].nunique()
    assert set(w["label"]) <= {"illicit", "licit", "unknown"}
    assert (w["first_step"] <= w["last_step"]).all()


def test_edges_drop_self_loops_and_duplicates() -> None:
    raw = pd.DataFrame({"input_address": ["a", "a", "a", "b", "x"], "output_address": ["a", "b", "b", "a", "a"]})
    e, stats = build_edges(raw, pd.Series(["a", "b"]))
    assert sorted(map(tuple, e.to_numpy())) == [("a", "b"), ("b", "a")]  # direction kept
    assert stats == {"raw": 5, "after_self_loops": 4, "after_dedupe": 3, "after_unknown_address_filter": 2}


def test_time_split() -> None:
    w = pd.DataFrame({"address": ["a", "b", "c"], "first_step": [1, 30, 49]})
    assert list(assign_splits(w)["split"]) == ["train", "val", "test"]


def test_pagerank_matches_networkx(raw: Path) -> None:
    feats, classes, edges_raw = read_raw(raw)
    w = build_wallets(feats, classes)
    e, _ = build_edges(edges_raw, w["address"])
    g = index_graph(w["address"], e)
    ours = pagerank(g.directed)
    G = nx.DiGraph()
    G.add_nodes_from(w["address"])
    G.add_edges_from(e.itertuples(index=False, name=None))
    ref = nx.pagerank(G, alpha=0.85, tol=1e-12, max_iter=500)
    np.testing.assert_allclose(ours, [ref[a] for a in w["address"]], rtol=1e-4)


def test_graph_features_tiny() -> None:
    wallets, edges = _tiny()
    splits = pd.Series(["train"] * 5)
    gf = graph_features(index_graph(wallets["address"], edges), wallets["label"], splits).set_index("address")
    assert gf.loc["b", "nb1_illicit_train"] == 2  # a and c
    assert gf.loc["a", "nb1_illicit_train"] == 0  # own label excluded
    assert gf.loc["a", "hops_to_illicit_train"] == 2  # c via b, not itself
    assert gf.loc["d", "hops_to_illicit_train"] == 1
    assert gf.loc["e", "hops_to_illicit_train"] == 3  # none
    assert gf.loc["e", "comp_size"] == 1 and gf.loc["a", "comp_size"] == 4
    assert gf.loc["b", "in_deg"] == 1 and gf.loc["b", "out_deg"] == 2


def test_no_label_leakage(raw: Path) -> None:
    """A wallet's own label, and any val/test label, must never change any wallet's features."""
    feats, classes, edges_raw = read_raw(raw)
    w = build_wallets(feats, classes)
    splits = assign_splits(w)["split"]
    e, _ = build_edges(edges_raw, w["address"])
    g = index_graph(w["address"], e)
    base = graph_features(g, w["label"], splits)

    # 1) flip every val/test label: nothing changes for anyone
    flipped = w["label"].where(splits == "train", "illicit")
    pd.testing.assert_frame_equal(base, graph_features(g, flipped, splits))

    # 2) flip one TRAIN wallet's own label: its own features do not change
    for i in np.flatnonzero((splits == "train").to_numpy())[:25]:
        lab = w["label"].copy()
        lab.iloc[i] = "licit" if lab.iloc[i] == "illicit" else "illicit"
        changed = graph_features(g, lab, splits)
        pd.testing.assert_series_equal(base.iloc[i][GRAPH_FEATURE_COLUMNS], changed.iloc[i][GRAPH_FEATURE_COLUMNS],
                                       check_names=False)
