"""Train baseline vs graph-feature XGBoost models with an honest protocol.

- Labelled wallets only (illicit = 1, licit = 0); unknown wallets are never training targets.
- Hyper-parameters chosen on VALIDATION (PR-AUC); calibration (isotonic) fitted on validation;
  verdict thresholds chosen on validation to meet stated precision targets.
- The TEST split is scored exactly once per model, after everything above is frozen.
"""

from __future__ import annotations

import itertools
import platform
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, confusion_matrix, precision_recall_fscore_support

from app.services.model.features import MODEL_FEATURES

# risk may only go up with more flagged neighbours and down with distance to them
MONOTONE = {"nb1_illicit_train": 1, "walk2_illicit_train": 1, "hops_to_illicit_train": -1}
GRID: dict[str, list[float]] = {"max_depth": [4, 6], "n_estimators": [200, 400], "learning_rate": [0.1]}
BLOCK_PRECISION_TARGET = 0.90
WARN_PRECISION_TARGET = 0.50
# policy floors on the calibrated score (= probability x 100): a score under 10 is never a warning
# and blocking needs at least a 50% calibrated probability, even if validation would allow lower
WARN_FLOOR = 10
BLOCK_FLOOR = 50


@dataclass
class TrainedModel:
    name: str
    features: list[str]
    booster: xgb.XGBClassifier
    calibrator: IsotonicRegression
    params: dict[str, Any]


def _xy(t: pd.DataFrame, split: str, feats: list[str]) -> tuple[pd.DataFrame, np.ndarray]:
    part = t[(t["split"] == split) & (t["label"] != "unknown")]
    return part[feats], (part["label"] == "illicit").to_numpy(dtype=int)


def _metrics(y: np.ndarray, score: np.ndarray, threshold: int) -> dict[str, Any]:
    pred = (score >= threshold).astype(int)
    p, r, f, _ = precision_recall_fscore_support(y, pred, average="binary", zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {"threshold": threshold, "precision": round(float(p), 4), "recall": round(float(r), 4),
            "illicitF1": round(float(f), 4), "confusion": {"tp": int(tp), "fp": int(fp), "fn": int(fn),
                                                           "tn": int(tn)}}


def to_score(prob: np.ndarray) -> np.ndarray:
    out: np.ndarray = np.rint(np.clip(prob, 0, 1) * 100).astype(int)
    return out


def choose_threshold(y: np.ndarray, score: np.ndarray, precision_target: float, floor: int = 1,
                     ceiling: int = 100) -> int | None:
    """Lowest integer score threshold in [floor, ceiling] whose precision reaches the target."""
    for t in range(floor, ceiling + 1):
        pred = score >= t
        if pred.sum() == 0:
            return None
        if y[pred].mean() >= precision_target:
            return t
    return None


def train_one(name: str, t: pd.DataFrame, seed: int) -> tuple[TrainedModel, dict[str, Any]]:
    feats = MODEL_FEATURES[name]
    x_tr, y_tr = _xy(t, "train", feats)
    x_va, y_va = _xy(t, "val", feats)
    if y_tr.sum() == 0 or y_va.sum() == 0:
        raise ValueError("train and validation splits need illicit examples")
    spw = float((y_tr == 0).sum() / max(1, y_tr.sum()))
    best: tuple[float, dict[str, Any], xgb.XGBClassifier] | None = None
    for md, ne, lr in itertools.product(GRID["max_depth"], GRID["n_estimators"], GRID["learning_rate"]):
        params = {"max_depth": int(md), "n_estimators": int(ne), "learning_rate": lr, "scale_pos_weight": spw,
                  "subsample": 0.9, "colsample_bytree": 0.9, "random_state": seed, "n_jobs": 4,
                  "tree_method": "hist", "eval_metric": "aucpr",
                  "monotone_constraints": "(" + ",".join(str(MONOTONE.get(f, 0)) for f in feats) + ")"}
        clf = xgb.XGBClassifier(**params)
        clf.fit(x_tr, y_tr)
        ap = float(average_precision_score(y_va, clf.predict_proba(x_va)[:, 1]))
        if best is None or ap > best[0]:
            best = (ap, params, clf)
    assert best is not None
    val_ap, params, clf = best
    raw_val = clf.predict_proba(x_va)[:, 1]
    cal = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(raw_val, y_va)
    val_score = to_score(cal.predict(raw_val))
    info = {"valPrAuc": round(val_ap, 4),
            "params": {k: v for k, v in params.items() if k not in ("eval_metric", "monotone_constraints")}
            | {"monotone": {f: c for f, c in MONOTONE.items() if f in feats}},
            "scalePosWeight": round(spw, 3), "valScores": val_score, "yVal": y_va}
    return TrainedModel(name, feats, clf, cal, params), info


def evaluate_test(m: TrainedModel, t: pd.DataFrame, warn: int, block: int) -> dict[str, Any]:
    x_te, y_te = _xy(t, "test", m.features)
    raw = m.booster.predict_proba(x_te)[:, 1]
    score = to_score(m.calibrator.predict(raw))
    at_warn = _metrics(y_te, score, warn)
    return {
        "illicitF1": at_warn["illicitF1"], "precision": at_warn["precision"], "recall": at_warn["recall"],
        "prAuc": round(float(average_precision_score(y_te, raw)), 4) if y_te.sum() else None,
        "atWarnThreshold": at_warn, "atBlockThreshold": _metrics(y_te, score, block),
        "testLabelled": len(y_te), "testIllicit": int(y_te.sum()),
    }


def thresholds_for(info: dict[str, Any], fallback_warn: int, fallback_block: int) -> dict[str, Any]:
    vs, yv = info["valScores"], info["yVal"]
    notes = []
    block = choose_threshold(yv, vs, BLOCK_PRECISION_TARGET, BLOCK_FLOOR)
    if block is None:
        block = max(fallback_block, BLOCK_FLOOR)
        notes.append(f"BLOCK precision target {BLOCK_PRECISION_TARGET} not reachable on validation; "
                     f"used configured threshold {block}")
    warn = choose_threshold(yv, vs, WARN_PRECISION_TARGET, WARN_FLOOR, block - 1)
    if warn is None:
        warn = min(max(fallback_warn, WARN_FLOOR), block - 1)
        notes.append(f"WARN precision target not reachable below BLOCK on validation; used {warn}")
    return {"warn": int(warn), "block": int(block), "chosenOn": "validation",
            "blockPrecisionTarget": BLOCK_PRECISION_TARGET, "warnPrecisionTarget": WARN_PRECISION_TARGET,
            "floors": {"warn": WARN_FLOOR, "block": BLOCK_FLOOR}, "notes": notes}


def train_all(t: pd.DataFrame, seed: int, source: str, fallback_warn: int, fallback_block: int
              ) -> tuple[dict[str, TrainedModel], dict[str, Any]]:
    models: dict[str, TrainedModel] = {}
    infos: dict[str, dict[str, Any]] = {}
    for name in MODEL_FEATURES:
        models[name], infos[name] = train_one(name, t, seed)
    # serving model chosen on VALIDATION PR-AUC only (never on test)
    serving = max(models, key=lambda n: infos[n]["valPrAuc"])
    grouped = t.groupby(["split", "label"]).size()
    split_counts = {f"{k[0]}:{k[1]}": int(n) for k, n in grouped.items() if isinstance(k, tuple)}
    card: dict[str, Any] = {
        "dataSource": source,
        "trainedAt": datetime.now(UTC).isoformat(),
        "seed": seed,
        "split": {"method": "time-based on first time step", "train": "1-28", "val": "29-34",
                  "test": "35-49", "counts": split_counts},
        "positiveClass": "illicit (class 1); licit = class 2; unknown wallets excluded from training/eval",
        "servingModel": serving,
        "calibration": "isotonic regression fitted on validation predictions; score = round(100 * p)",
        "metricsDefinition": "test split, illicit class, predicted illicit = score >= that model's warn "
                             "threshold (verdict WARN or BLOCK); prAuc on uncalibrated probabilities",
        "models": {},
        "versions": {"python": platform.python_version(), "xgboost": xgb.__version__,
                     "scikit-learn": sklearn.__version__, "pandas": pd.__version__, "numpy": np.__version__},
    }
    for name, m in models.items():
        th = thresholds_for(infos[name], fallback_warn, fallback_block)
        card["models"][name] = {
            "features": m.features, "nFeatures": len(m.features),
            "valPrAuc": infos[name]["valPrAuc"], "params": infos[name]["params"], "thresholds": th,
            "test": evaluate_test(m, t, th["warn"], th["block"]),
        }
    card["thresholds"] = card["models"][serving]["thresholds"]
    f1 = {n: card["models"][n]["test"]["illicitF1"] for n in models}
    card["graphFeaturesImprovedTestF1"] = bool(f1["with_graph_features"] > f1["baseline"])
    return models, card
