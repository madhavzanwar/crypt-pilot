"""Inspect the raw Elliptic++ CSVs and write artifacts/data_summary.json.

Copy the key findings into DECISIONS.md ("Data findings").
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tqdm import tqdm

from app.config import get_settings
from app.services.datasets.processing import (
    check_schema,
    detect_lfs_pointers,
    lfs_pointer_message,
    read_raw,
    summarize,
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, default=Path("data/raw"))
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    out = args.out or get_settings().artifacts_dir / "data_summary.json"
    pointers = detect_lfs_pointers(args.raw)
    if pointers:
        sys.exit(lfs_pointer_message(pointers))
    with tqdm(total=2, desc="explore") as bar:
        feats, classes, edges = read_raw(args.raw)
        bar.update(1)
        problems = check_schema(feats, classes, edges)
        if problems:
            print("SCHEMA PROBLEMS:\n- " + "\n- ".join(problems))
            sys.exit(1)
        summary = summarize(feats, classes, edges)
        bar.update(1)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
