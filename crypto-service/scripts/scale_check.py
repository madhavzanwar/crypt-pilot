"""Volume stress test: does the pipeline survive the REAL size of Elliptic++?

Generates SYNTHETIC data with the exact published row counts (822,942 wallets, 1,268,260 feature rows,
2,868,964 edges, 14,266 / 251,088 / 557,588 illicit / licit / unknown) in the Hugging Face combined layout
and runs every heavy stage in its own child process, recording wall time and peak RSS per stage.

THE MODEL METRICS FROM THIS RUN ARE MEANINGLESS (random features) and are never reported. Only time and
memory are measurements. Output stays under data/scale/ (git-ignored). Real results come from the real data.

    uv run python -m scripts.scale_check --out data/scale
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

N_WALLETS = 822_942
N_FEATURE_ROWS = 1_268_260
N_EDGES = 2_868_964
CLASS_COUNTS = {1: 14_266, 2: 251_088, 3: 557_588}
N_HUBS = 200
STAGES = ["gen", "explore", "build", "train", "serve"]


def stage_gen(out: Path) -> dict[str, Any]:
    import numpy as np
    import pyarrow as pa
    import pyarrow.csv as pacsv

    from app.services.datasets.schema import FEATURE_COLUMNS

    raw = out / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    ids = np.array([f"DEMO-w{i:06d}" for i in range(N_WALLETS)])
    classes = np.concatenate([np.full(c, k, dtype=np.int8) for k, c in CLASS_COUNTS.items()])
    assert len(classes) == N_WALLETS
    rng.shuffle(classes)
    first_step = rng.integers(1, 50, size=N_WALLETS)
    per_wallet = np.abs(rng.standard_normal((N_WALLETS, len(FEATURE_COLUMNS)), dtype=np.float32))

    extra = N_FEATURE_ROWS - N_WALLETS
    idx = np.concatenate([np.arange(N_WALLETS), rng.integers(0, N_WALLETS, size=extra)])
    steps = np.concatenate([first_step, np.clip(first_step[idx[N_WALLETS:]] + rng.integers(0, 4, size=extra), 1, 49)])
    cols: dict[str, Any] = {"address": pa.array(ids[idx]), "Time step": pa.array(steps.astype(np.int64))}
    for j, name in enumerate(FEATURE_COLUMNS):
        cols[name] = pa.array(per_wallet[idx, j].astype(np.float64))
    cols["class"] = pa.array(classes[idx].astype(np.int64))
    pacsv.write_csv(pa.table(cols), raw / "wallets_features_classes_combined.csv")
    del cols, per_wallet

    # edges: 30% of endpoints are drawn from a few heavy hubs (the real graph has very high degree wallets)
    weights = 1.0 / np.arange(1, N_HUBS + 1)
    weights /= weights.sum()
    src = rng.integers(0, N_WALLETS, size=N_EDGES)
    dst = rng.integers(0, N_WALLETS, size=N_EDGES)
    hub_mask = rng.random(N_EDGES) < 0.30
    dst[hub_mask] = rng.choice(N_HUBS, size=int(hub_mask.sum()), p=weights)
    dst[:3000] = src[:3000]  # self-loops
    src[3000:6000], dst[3000:6000] = src[6000:9000], dst[6000:9000]  # duplicates
    pacsv.write_csv(pa.table({"input_address": pa.array(ids[src]), "output_address": pa.array(ids[dst])}),
                    raw / "AddrAddr_edgelist.csv")
    return {"wallets": N_WALLETS, "feature_rows": N_FEATURE_ROWS, "edges": N_EDGES,
            "csv_bytes": {p.name: p.stat().st_size for p in raw.glob("*.csv")}}


def stage_explore(out: Path) -> dict[str, Any]:
    from app.services.datasets.processing import check_schema, read_raw, summarize

    feats, classes, edges = read_raw(out / "raw")
    problems = check_schema(feats, classes, edges)
    summary = summarize(feats, classes, edges)
    return {"schema_problems": problems, "unique_addresses": summary["wallets_features"]["unique_addresses"],
            "max_degree": summary["AddrAddr_edgelist"]["max_degree"]}


def stage_build(out: Path) -> dict[str, Any]:
    from scripts.build_processed import build

    m = build(out / "raw", out / "processed", "synthetic_fixture")
    return {"wallets": m["wallets"], "edges_after_filters": m["edges"], "largest_component": m["largest_component"]}


def stage_train(out: Path) -> dict[str, Any]:
    from scripts.train import run

    card = run(out / "processed", out / "artifacts", 42, 35, 70)
    return {"serving_model": card["servingModel"], "note": "metrics on random data are NOT reported"}


def stage_serve(out: Path) -> dict[str, Any]:
    import numpy as np

    from app.services.model.scorer import Scorer

    t0 = time.perf_counter()
    s = Scorer(out / "artifacts", out / "processed")
    load_s = time.perf_counter() - t0
    rng = np.random.default_rng(1)
    picks = s.table.index[rng.integers(0, len(s.table), size=500)]
    lat = []
    for a in picks:
        t = time.perf_counter()
        s.score(str(a))
        lat.append((time.perf_counter() - t) * 1000)
    lat.sort()
    return {"scorer_load_s": round(load_s, 2), "score_ms_median": round(lat[len(lat) // 2], 2),
            "score_ms_p95": round(lat[int(len(lat) * 0.95)], 2), "n_scored": len(lat)}


RUNNERS = {"gen": stage_gen, "explore": stage_explore, "build": stage_build, "train": stage_train,
           "serve": stage_serve}


def run_child(stage: str, out: Path) -> dict[str, Any]:
    cmd = [sys.executable, "-m", "scripts.scale_check", "--stage", stage, "--out", str(out)]
    t0 = time.perf_counter()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    stdout = proc.stdout.read()
    _, status, usage = os.wait4(proc.pid, 0)
    seconds = time.perf_counter() - t0
    ok = os.waitstatus_to_exitcode(status) == 0
    detail: dict[str, Any] = {}
    if ok and stdout.strip():
        detail = json.loads(stdout.strip().splitlines()[-1])
    return {"stage": stage, "ok": ok, "seconds": round(seconds, 1), "peak_rss_mb": round(usage.ru_maxrss / 1024),
            "detail": detail}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("data/scale"))
    ap.add_argument("--stage", choices=STAGES)
    ap.add_argument("--only", nargs="*", choices=STAGES)
    args = ap.parse_args()
    if args.stage:  # child process: do one stage, print one JSON line
        print(json.dumps(RUNNERS[args.stage](args.out)))
        return
    results = []
    for st in args.only or STAGES:
        r = run_child(st, args.out)
        results.append(r)
        print(f"{st:8s} ok={r['ok']} {r['seconds']:7.1f}s  peak_rss={r['peak_rss_mb']} MB  {r['detail']}", flush=True)
        if not r["ok"]:
            break
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "scale_report.json").write_text(json.dumps(
        {"data": "SYNTHETIC at real volume (not Elliptic++)", "stages": results}, indent=2))
    sys.exit(0 if all(r["ok"] for r in results) else 1)


if __name__ == "__main__":
    main()
