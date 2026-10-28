"""Label-leakage guarantees on the REAL Elliptic++ graph (skipped when data/processed is not the real data).

1. Changing every validation/test label changes NO feature of any wallet.
2. A wallet's own label never influences its own features (checked on wallets that are >= 3 hops apart, so one
   flip cannot legitimately reach another checked wallet).
3. Non-vacuous: flipping those training labels DOES change some other wallet's features.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.datasets.processing import GRAPH_FEATURE_COLUMNS, graph_features, index_graph

PROCESSED = Path("data/processed")


def _is_real() -> bool:
    try:
        return json.loads((PROCESSED / "manifest.json").read_text())["source"] == "elliptic++"
    except (OSError, KeyError, ValueError):
        return False


pytestmark = pytest.mark.skipif(not _is_real(), reason="real Elliptic++ data not processed (run make data)")


@pytest.fixture(scope="module")
def real() -> tuple[object, pd.Series, pd.Series, pd.DataFrame]:
    w = pd.read_parquet(PROCESSED / "wallets.parquet", columns=["address", "label"])
    sp = pd.read_parquet(PROCESSED / "splits.parquet", columns=["address", "split"])
    edges = pd.read_parquet(PROCESSED / "edges.parquet")
    g = index_graph(w["address"], edges)
    base = graph_features(g, w["label"], sp["split"])
    return g, w["label"], sp["split"], base


def _far_apart_train_wallets(g, labels: pd.Series, splits: pd.Series, n: int, seed: int = 5) -> list[int]:  # type: ignore[no-untyped-def]
    """Random low-degree training wallets, pairwise >= 3 hops apart (so flips cannot reach one another)."""
    a = g.undirected
    deg = np.asarray(a.sum(axis=1)).ravel()
    rng = np.random.default_rng(seed)
    cand = rng.permutation(np.flatnonzero((splits.to_numpy() == "train") & (deg >= 1) & (deg <= 8)))
    forbidden = np.zeros(a.shape[0], dtype=bool)
    chosen: list[int] = []
    for i in cand:
        if forbidden[i]:
            continue
        n1 = a.indices[a.indptr[i]:a.indptr[i + 1]]
        if (deg[n1] > 300).any():
            continue  # skip candidates next to a hub (their 2-hop ball is huge)
        forbidden[i] = True
        forbidden[n1] = True
        for j in n1:
            forbidden[a.indices[a.indptr[j]:a.indptr[j + 1]]] = True
        chosen.append(int(i))
        if len(chosen) == n:
            break
    return chosen


def test_validation_and_test_labels_never_influence_features(real) -> None:  # type: ignore[no-untyped-def]
    g, labels, splits, base = real
    scrambled = labels.where(splits == "train", "illicit")  # every val/test wallet becomes "illicit"
    pd.testing.assert_frame_equal(base, graph_features(g, scrambled, splits))


def test_own_label_never_influences_own_features_and_test_is_not_vacuous(real) -> None:  # type: ignore[no-untyped-def]
    g, labels, splits, base = real
    chosen = _far_apart_train_wallets(g, labels, splits, 200)
    assert len(chosen) >= 100, "could not find enough independent wallets for a meaningful check"
    flipped = labels.copy()
    flip = {"illicit": "licit", "licit": "illicit", "unknown": "illicit"}
    flipped.iloc[chosen] = [flip[x] for x in labels.iloc[chosen]]
    assert (flipped.iloc[chosen].to_numpy() != labels.iloc[chosen].to_numpy()).all()
    new = graph_features(g, flipped, splits)
    cols = GRAPH_FEATURE_COLUMNS
    own_same = (base.iloc[chosen][cols].to_numpy() == new.iloc[chosen][cols].to_numpy()).all()
    assert own_same, "a wallet's own label changed its own features"
    changed = (base[cols].to_numpy() != new[cols].to_numpy()).any(axis=1)
    assert changed.sum() > 0, "flipping training labels changed nobody's features: the check proves nothing"
    assert not changed[chosen].any()
