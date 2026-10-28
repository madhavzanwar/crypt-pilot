from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.datasets.processing import GRAPH_FEATURE_COLUMNS
from app.services.model.policy import decide
from app.services.model.reasons import ReasonInput, build_reasons, feature_name
from app.services.model.scorer import Scorer
from app.services.model.training import choose_threshold


@pytest.fixture(scope="module")
def scorer(trained: tuple[Path, Path]) -> Scorer:
    processed, artifacts = trained
    return Scorer(artifacts, processed)


def test_model_card_is_honest(trained: tuple[Path, Path]) -> None:
    card = json.loads((trained[1] / "model_card.json").read_text())
    assert card["dataSource"] == "synthetic_fixture"
    assert set(card["models"]) == {"baseline", "with_graph_features"}
    for m in card["models"].values():
        t = m["test"]
        assert 0 <= t["illicitF1"] <= 1 and "confusion" in t["atWarnThreshold"]
    th = card["thresholds"]
    assert 10 <= th["warn"] < th["block"] <= 100 and th["chosenOn"] == "validation"


def test_fixture_metrics_never_surface(scorer: Scorer) -> None:
    assert scorer.illicit_f1_test is None


def test_score_is_deterministic_and_bounded(scorer: Scorer) -> None:
    addr = scorer.table.index[0]
    a, b = scorer.score(addr), scorer.score(addr)
    assert a is not None and b is not None and a.score == b.score and 0 <= a.score <= 100
    assert scorer.score("DEMO-notindataset") is None


def test_monotonic_in_flagged_neighbours(scorer: Scorer) -> None:
    """More flagged neighbours / shorter distance to them never lowers the raw model output."""
    if scorer.model_name != "with_graph_features":
        pytest.skip("serving model has no graph features")
    rows = scorer.table[scorer.model.features].iloc[:200].copy()
    base = scorer.model.booster.predict_proba(rows)[:, 1]
    more = rows.copy()
    more["nb1_illicit_train"] += 3
    more["walk2_illicit_train"] += 5
    more["hops_to_illicit_train"] = 1
    assert np.all(scorer.model.booster.predict_proba(more)[:, 1] >= base - 1e-9)


def test_test_wallet_label_does_not_change_its_score(trained: tuple[Path, Path]) -> None:
    """Flip the labels of test wallets, recompute graph features: their scores must not move."""
    from app.services.datasets.processing import graph_features, index_graph

    processed, artifacts = trained
    scorer = Scorer(artifacts, processed)  # private copy: this test mutates its table
    w = pd.read_parquet(processed / "wallets.parquet", columns=["address", "label"])
    sp = pd.read_parquet(processed / "splits.parquet", columns=["address", "split"])
    e = pd.read_parquet(processed / "edges.parquet")
    test_ids = list(scorer.table.index[scorer.table["split"] == "test"][:30])
    before = {a: scorer.score(a).score for a in test_ids}  # type: ignore[union-attr]
    flipped = w["label"].where(~w["address"].isin(test_ids), "illicit")
    gf = graph_features(index_graph(w["address"], e), flipped, sp["split"]).set_index("address")
    scorer.table.loc[test_ids, GRAPH_FEATURE_COLUMNS] = gf.loc[test_ids, GRAPH_FEATURE_COLUMNS].astype("float32")
    scorer.table.loc[test_ids, "label"] = "illicit"
    assert "label" not in scorer.model.features and "split" not in scorer.model.features
    assert {a: scorer.score(a).score for a in test_ids} == before  # type: ignore[union-attr]


@pytest.mark.parametrize(("score", "in_ds", "ofac", "expected"), [
    (5, True, False, "ALLOW"), (35, True, False, "WARN"), (69, True, False, "WARN"), (70, True, False, "BLOCK"),
    (5, True, True, "BLOCK"), (None, False, True, "BLOCK"), (None, False, False, "UNKNOWN"),
])
def test_verdict_policy(score: int | None, in_ds: bool, ofac: bool, expected: str) -> None:
    assert decide(score, in_ds, ofac, warn=35, block=70) == expected


def test_choose_threshold() -> None:
    y = np.array([0, 0, 1, 1, 1])
    s = np.array([10, 40, 45, 80, 90])
    assert choose_threshold(y, s, 0.9) == 41
    assert choose_threshold(y, s, 0.6) == 1  # all five predicted: 3/5 = 0.6
    assert choose_threshold(np.array([0, 0]), np.array([90, 95]), 0.9) is None


def _ri(**kw: object) -> ReasonInput:
    base = dict(ofac=False, ransomwhere=False, in_dataset=True, dataset_label="unknown", hop1_illicit=0,
                nearest_illicit=None, max_hop=3, comp_size=10, pagerank=0.1, pagerank_p99=0.5,
                verdict="ALLOW", contributions=[])
    base.update(kw)
    return ReasonInput(**base)  # type: ignore[arg-type]


def test_reasons_rules() -> None:
    r = build_reasons(_ri(ofac=True, hop1_illicit=2, nearest_illicit=1, comp_size=5000, pagerank=0.9,
                          verdict="BLOCK", contributions=[("btc_received_max", 1.2), ("fees_min", -0.4)]))
    en = [x[0] for x in r]
    assert en[0] == "Appears on the OFAC sanctions list"
    assert "2 flagged wallets within 1 hop" in en
    assert "Part of a large connected cluster of 5000 wallets" in en
    assert any("high PageRank" in x for x in en)
    assert "Model signal: largest BTC received raised the risk" in en
    assert not any("fees" in x for x in en)  # negative contribution not used for a BLOCK
    assert all(hi for _, hi in r)


def test_reasons_not_in_dataset_and_no_flags() -> None:
    assert build_reasons(_ri(in_dataset=False))[0][0].startswith("Not in the Elliptic++")
    en = [x[0] for x in build_reasons(_ri())]
    assert "No flagged wallet within 3 hops" in en


def test_feature_names_are_plain_language() -> None:
    assert feature_name("btc_sent_median") == ("median BTC sent", "मध्य भेजी गई BTC")
    assert feature_name("num_txs_as receiver")[0] == "number of payments received"
