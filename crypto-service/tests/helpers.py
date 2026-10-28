"""Build a synthetic dataset + trained artifacts once per test session."""

from __future__ import annotations

import json
from pathlib import Path

from app.services.model.scorer import Scorer
from scripts.build_processed import build
from scripts.export_demo_wallets import pick
from scripts.make_fixture import make_fixture
from scripts.train import run as train_run


def build_trained_fixture(root: Path) -> tuple[Path, Path]:
    raw, processed, artifacts = root / "raw", root / "processed", root / "artifacts"
    make_fixture(raw, n_wallets=1500, seed=7)
    build(raw, processed, "synthetic_fixture")
    train_run(processed, artifacts, seed=42, warn=35, block=70)
    wallets = pick(Scorer(artifacts, processed))
    (artifacts / "demo_wallets.json").write_text(json.dumps({"dataSource": "synthetic_fixture", "wallets": wallets}))
    return processed, artifacts
