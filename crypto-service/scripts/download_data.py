"""Download Elliptic++ (Actors dataset) into data/raw/ and verify it is REAL data.

Sources (use whichever is reachable):
  hf     Hugging Face mirror AI4FinTech/ellipticpp (huggingface_hub). No separate wallets_classes.csv:
         the pipeline reads labels from wallets_features_classes_combined.csv.
  gdrive Google Drive folder linked in https://github.com/git-disl/EllipticPlusPlus (gdown).

Verification (printed, never silently ignored): Git-LFS pointer files, file sizes, row counts versus the
figures published by the dataset authors. A mismatch is REPORTED; the script exits 1 on pointers or
missing files, and exits 2 if only counts differ.

    uv run --group data python -m scripts.download_data --source hf
    uv run python -m scripts.download_data --verify-only        # just check data/raw
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.services.datasets.processing import detect_lfs_pointers, lfs_pointer_message

HF_REPO = "AI4FinTech/ellipticpp"
GDRIVE_FOLDER = "https://drive.google.com/drive/folders/1MRPXz79Lu_JGLlJ21MDfML44dKN9R08l"
HF_FILES = ["wallets_features.csv", "wallets_features_classes_combined.csv", "AddrAddr_edgelist.csv"]

# Published by the dataset authors (https://github.com/git-disl/EllipticPlusPlus, Actors dataset table).
EXPECTED = {
    "wallets": 822_942,
    "feature_rows": 1_268_260,
    "edges": 2_868_964,
    "illicit": 14_266,
    "licit": 251_088,
    "unknown": 557_588,
}
# The three files' approximate sizes from the Git-LFS pointers in the authors' repo (bytes): used only as a
# sanity floor (a real file is tens of MB or more; a pointer is ~130 bytes).
MIN_REAL_BYTES = 1_000_000


def count_rows(path: Path) -> int:
    """Data rows in a CSV (lines minus header), streaming, without parsing."""
    n = 0
    with path.open("rb") as f:
        for n, _ in enumerate(f):  # noqa: B007
            pass
    return max(0, n)  # enumerate is 0-based: n = lines - 1 = data rows when there is a header


def verify_raw(raw_dir: Path) -> dict[str, Any]:
    """Return a report dict: files (size, rows), pointers, mismatches, ok flag."""
    report: dict[str, Any] = {"files": {}, "lfs_pointers": [], "problems": [], "mismatches": []}
    pointers = detect_lfs_pointers(raw_dir)
    report["lfs_pointers"] = [p.name for p in pointers]
    if pointers:
        report["problems"].append(lfs_pointer_message(pointers))
    present = {p.name: p for p in raw_dir.glob("*.csv")} if raw_dir.exists() else {}
    for name in [*HF_FILES, "wallets_classes.csv"]:
        p = present.get(name)
        if p is None:
            continue
        size = p.stat().st_size
        entry: dict[str, Any] = {"bytes": size}
        if size < MIN_REAL_BYTES:
            report["problems"].append(f"{name} is only {size} bytes: not real data")
        else:
            entry["rows"] = count_rows(p)
        report["files"][name] = entry
    edges = report["files"].get("AddrAddr_edgelist.csv")
    if edges is None:
        report["problems"].append("AddrAddr_edgelist.csv missing")
    elif "rows" in edges and edges["rows"] != EXPECTED["edges"]:
        report["mismatches"].append(f"edges: found {edges['rows']}, expected {EXPECTED['edges']}")
    feats = report["files"].get("wallets_features.csv") or report["files"].get("wallets_features_classes_combined.csv")
    if feats is None:
        report["problems"].append("neither wallets_features.csv nor wallets_features_classes_combined.csv present")
    elif "rows" in feats and feats["rows"] != EXPECTED["feature_rows"]:
        report["mismatches"].append(f"feature rows: found {feats['rows']}, expected {EXPECTED['feature_rows']}")
    if "wallets_classes.csv" in report["files"] and "rows" in report["files"]["wallets_classes.csv"]:
        rows = report["files"]["wallets_classes.csv"]["rows"]
        if rows != EXPECTED["wallets"]:
            report["mismatches"].append(f"wallets (classes rows): found {rows}, expected {EXPECTED['wallets']}")
    report["ok"] = not report["problems"]
    return report


def download_hf(raw_dir: Path, files: list[str]) -> None:
    from huggingface_hub import hf_hub_download  # lazy: optional "data" dependency group

    for name in files:
        print(f"hf: downloading {name} ...", flush=True)
        hf_hub_download(repo_id=HF_REPO, repo_type="dataset", filename=name, local_dir=str(raw_dir))


def download_gdrive(raw_dir: Path) -> None:
    import gdown  # lazy: optional "data" dependency group

    print("gdrive: downloading folder (large; Google may rate-limit) ...", flush=True)
    gdown.download_folder(GDRIVE_FOLDER, output=str(raw_dir), quiet=False, use_cookies=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["hf", "gdrive"], default="hf")
    ap.add_argument("--raw", type=Path, default=Path("data/raw"))
    ap.add_argument("--files", nargs="*", default=["wallets_features_classes_combined.csv", "AddrAddr_edgelist.csv"],
                    help="hf only; the combined file already has the features AND the classes")
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()
    args.raw.mkdir(parents=True, exist_ok=True)
    if not args.verify_only:
        try:
            if args.source == "hf":
                download_hf(args.raw, args.files)
            else:
                download_gdrive(args.raw)
        except Exception as exc:  # network policy, auth, rate limits: say it plainly and stop
            sys.exit(f"download failed ({type(exc).__name__}): {exc}\n"
                     "If this is a network policy denial, allow the host in the environment settings.")
    report = verify_raw(args.raw)
    print(json.dumps(report, indent=2))
    if not report["ok"]:
        sys.exit(1)
    if report["mismatches"]:
        print("MISMATCH versus the published figures: " + "; ".join(report["mismatches"]))
        sys.exit(2)
    print("data looks real and matches the published row counts")


if __name__ == "__main__":
    main()
