"""Train baseline + graph-feature models, calibrate, choose thresholds on validation, evaluate on test
once, and write artifacts/model.joblib + artifacts/model_card.json. Reproducible (fixed seed)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib

from app.config import get_settings
from app.services.model.features import load_feature_table
from app.services.model.training import train_all


def run(processed: Path, artifacts: Path, seed: int, warn: int, block: int) -> dict[str, object]:
    manifest = json.loads((processed / "manifest.json").read_text())
    table = load_feature_table(processed)
    models, card = train_all(table, seed, manifest["source"], warn, block)
    card["datasetCounts"] = {"wallets": manifest["wallets"], "labels": manifest["label_counts"],
                             "edges": manifest["edges"]["after_unknown_address_filter"]}
    artifacts.mkdir(parents=True, exist_ok=True)
    joblib.dump({"models": models}, artifacts / "model.joblib")
    (artifacts / "model_card.json").write_text(json.dumps(card, indent=2))
    return card


def main() -> None:
    s = get_settings()
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--processed", type=Path, default=s.processed_dir)
    ap.add_argument("--artifacts", type=Path, default=s.artifacts_dir)
    args = ap.parse_args()
    card = run(args.processed, args.artifacts, args.seed, s.threshold_warn, s.threshold_block)
    summary = {n: m["test"] for n, m in card["models"].items()}  # type: ignore[attr-defined]
    print(json.dumps({"dataSource": card["dataSource"], "servingModel": card["servingModel"],
                      "thresholds": card["thresholds"], "test": summary,
                      "graphFeaturesImprovedTestF1": card["graphFeaturesImprovedTestF1"]}, indent=2))


if __name__ == "__main__":
    main()
