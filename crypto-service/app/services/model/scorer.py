"""Serving-time scorer: loads the trained serving model + calibrator + precomputed feature table."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

from app.services.model.features import load_feature_table
from app.services.model.training import TrainedModel


@dataclass
class ScoreResult:
    probability: float
    score: int
    contributions: list[tuple[str, float]]  # (feature, log-odds contribution), sorted by |value|
    features: dict[str, float]


class Scorer:
    def __init__(self, artifacts_dir: Path, processed_dir: Path) -> None:
        # model.joblib is produced locally by scripts/train.py (trusted artifact, never user input)
        bundle: dict[str, Any] = joblib.load(artifacts_dir / "model.joblib")
        self.card: dict[str, Any] = json.loads((artifacts_dir / "model_card.json").read_text())
        self.model_name: str = self.card["servingModel"]
        self.model: TrainedModel = bundle["models"][self.model_name]
        self.table = load_feature_table(processed_dir)
        self.warn = int(self.card["thresholds"]["warn"])
        self.block = int(self.card["thresholds"]["block"])
        self.pagerank_p99 = float(self.table["pagerank"].quantile(0.99))
        self.data_source: str = self.card.get("dataSource", "unknown")

    @property
    def illicit_f1_test(self) -> float | None:
        if self.data_source != "elliptic++":
            return None  # never surface metrics measured on the synthetic fixture
        f1 = self.card["models"][self.model_name]["test"].get("illicitF1")
        return None if f1 is None else float(f1)

    def has(self, address: str) -> bool:
        return address in self.table.index

    def label(self, address: str) -> str | None:
        return str(self.table.at[address, "label"]) if self.has(address) else None

    def split(self, address: str) -> str | None:
        return str(self.table.at[address, "split"]) if self.has(address) else None

    def score(self, address: str) -> ScoreResult | None:
        if not self.has(address):
            return None
        row = self.table.loc[[address], self.model.features]
        raw = float(self.model.booster.predict_proba(row)[:, 1][0])
        prob = float(np.asarray(self.model.calibrator.predict(np.array([raw])))[0])
        contrib = self.model.booster.get_booster().predict(xgb.DMatrix(row), pred_contribs=True)[0][:-1]
        pairs = sorted(zip(self.model.features, (float(c) for c in contrib), strict=True),
                       key=lambda kv: -abs(kv[1]))
        values = self.table.loc[address, self.model.features].to_numpy(dtype=float)
        feats = {f: float(v) for f, v in zip(self.model.features, values, strict=True)}
        return ScoreResult(prob, round(min(max(prob, 0.0), 1.0) * 100), pairs, feats)

    def batch_scores(self, addresses: pd.Index) -> np.ndarray:
        x = self.table.loc[addresses, self.model.features]
        raw = self.model.booster.predict_proba(x)[:, 1]
        out: np.ndarray = np.rint(np.clip(self.model.calibrator.predict(raw), 0, 1) * 100).astype(int)
        return out
