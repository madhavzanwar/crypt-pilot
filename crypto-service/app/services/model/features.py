"""Feature tables for the two models. Both read the same precomputed Parquet files."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.services.datasets.processing import GRAPH_FEATURE_COLUMNS
from app.services.datasets.schema import FEATURE_COLUMNS

BASELINE_FEATURES: list[str] = list(FEATURE_COLUMNS)
GRAPH_FEATURES: list[str] = list(FEATURE_COLUMNS) + GRAPH_FEATURE_COLUMNS
MODEL_FEATURES = {"baseline": BASELINE_FEATURES, "with_graph_features": GRAPH_FEATURES}


def load_feature_table(processed_dir: Path) -> pd.DataFrame:
    """address-indexed table: label, split and every model feature (float32)."""
    w = pd.read_parquet(processed_dir / "wallets.parquet", columns=["address", "label", *FEATURE_COLUMNS])
    gf = pd.read_parquet(processed_dir / "graph_features.parquet",
                         columns=["address", *GRAPH_FEATURE_COLUMNS])
    sp = pd.read_parquet(processed_dir / "splits.parquet", columns=["address", "split"])
    t = w.merge(gf, on="address", how="left").merge(sp, on="address", how="left").set_index("address")
    t[GRAPH_FEATURES] = t[GRAPH_FEATURES].astype("float32")
    return t
