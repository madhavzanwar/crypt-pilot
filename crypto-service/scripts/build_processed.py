"""Raw CSVs -> data/processed/{wallets,edges,splits,graph_features}.parquet + manifest.json.

Idempotent: re-running overwrites the outputs. Use --source synthetic_fixture for the fake fixture.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from tqdm import tqdm

from app.config import get_settings
from app.services.datasets.processing import (
    assign_splits,
    build_edges,
    build_wallets,
    check_schema,
    detect_lfs_pointers,
    graph_features,
    index_graph,
    lfs_pointer_message,
    read_raw,
)


def build(raw: Path, out: Path, source: str) -> dict[str, object]:
    pointers = detect_lfs_pointers(raw)
    if pointers:
        raise SystemExit(lfs_pointer_message(pointers))
    steps = tqdm(total=6, desc="build_processed")
    feats, classes, edges_raw = read_raw(raw)
    problems = check_schema(feats, classes, edges_raw)
    if problems:
        raise SystemExit("schema problems: " + "; ".join(problems))
    steps.update(1)
    wallets = build_wallets(feats, classes)
    steps.update(1)
    splits = assign_splits(wallets)
    steps.update(1)
    edges, edge_stats = build_edges(edges_raw, wallets["address"])
    steps.update(1)
    g = index_graph(wallets["address"], edges)
    gf = graph_features(g, wallets["label"], splits["split"])
    steps.update(1)

    out.mkdir(parents=True, exist_ok=True)
    wallets.to_parquet(out / "wallets.parquet", index=False)
    edges.to_parquet(out / "edges.parquet", index=False)
    splits.to_parquet(out / "splits.parquet", index=False)
    gf.to_parquet(out / "graph_features.parquet", index=False)
    steps.update(1)
    steps.close()

    manifest = {
        "source": source,
        "built_at": datetime.now(UTC).isoformat(),
        "wallets": len(wallets),
        "label_counts": wallets["label"].value_counts().to_dict(),
        "edges": edge_stats,
        "split_counts": splits.groupby(["split"]).size().to_dict(),
        "split_label_counts": {
            f"{sp}:{lab}": int(n)
            for (sp, lab), n in
            splits.assign(label=wallets["label"]).groupby(["split", "label"]).size().items()
        },
        "wallets_without_features": int(wallets["first_step"].isna().sum()),
        "components": int(gf["comp_id"].nunique()),
        "largest_component": int(gf["comp_size"].max()),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, default=int))
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, default=Path("data/raw"))
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--source", default="elliptic++", choices=["elliptic++", "synthetic_fixture"])
    args = ap.parse_args()
    out = args.out or get_settings().processed_dir
    print(json.dumps(build(args.raw, out, args.source), indent=2, default=int))


if __name__ == "__main__":
    main()
