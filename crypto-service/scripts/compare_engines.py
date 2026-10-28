"""Compare TigerGraph with NetworkX on demo wallets + random wallets, measure latency, test hub safety.

Needs a loaded TigerGraph (TG_* in .env) and data/processed. NetworkX is built from the SAME vertex/edge set
that was loaded into TigerGraph (the recorded subset), so any difference is a real engine difference.
Writes artifacts/tg_compare.json. Exit 1 on any difference, engine error or hung call.

    uv run python -m scripts.compare_engines --random 50 --calls 60 --hubs 5
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.services.graph.compare import compare_engines, hub_check, measure_latency
from app.services.graph.networkx_engine import NetworkXEngine
from app.services.graph.tigergraph_engine import TigerGraphEngine
from scripts.load_tigergraph import load_frames


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", type=int, default=50)
    ap.add_argument("--calls", type=int, default=60, help="latency calls (>= 50)")
    ap.add_argument("--hubs", type=int, default=5)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    s = get_settings()
    if not s.tg_configured:
        sys.exit("TG_HOST and TG_SECRET (or TG_USERNAME/TG_PASSWORD) are not set in backend/.env")
    summary_path = s.artifacts_dir / "tg_load_summary.json"
    subset = json.loads(summary_path.read_text())["subset"] if summary_path.exists() else "full"
    vertices, edges = load_frames(s.processed_dir, subset)
    nx_engine = NetworkXEngine.from_frames(vertices[["address", "label"]], vertices, edges, s.max_frontier)
    tg = TigerGraphEngine(s.tg_host, s.tg_graph, s.tg_secret.get_secret_value(), s.tg_username,
                          s.tg_password.get_secret_value(), s.tg_query_timeout_s, s.max_frontier)
    if not tg.ping():
        sys.exit("TigerGraph is not reachable (check TG_HOST / TG_SECRET)")

    demo: list[str] = []
    demo_path = Path(s.artifacts_dir / "demo_wallets.json")
    if demo_path.exists():
        in_graph = set(vertices["address"])
        demo = [w["address"] for w in json.loads(demo_path.read_text())["wallets"] if w["address"] in in_graph]
    rng = np.random.default_rng(args.seed)
    rand = [str(a) for a in rng.choice(vertices["address"].to_numpy(), size=args.random, replace=False)]
    addresses = list(dict.fromkeys(demo + rand))

    report: dict[str, object] = {"subset": subset, "vertices": len(vertices), "edges": len(edges),
                                 "max_hop": s.max_hop, "max_nodes": s.max_subgraph_nodes}
    report["comparison"] = cmp = compare_engines(tg, nx_engine, addresses, s.max_hop, s.max_subgraph_nodes)
    report["latency_tigergraph"] = measure_latency(tg, addresses, args.calls, s.max_hop, s.max_subgraph_nodes)
    top = vertices.assign(deg=vertices["in_deg"] + vertices["out_deg"]).nlargest(args.hubs, "deg")
    hubs = [(str(a), int(d)) for a, d in zip(top["address"], top["deg"], strict=True)]
    report["hubs"] = hub_rows = hub_check(tg, hubs, s.max_hop, s.max_subgraph_nodes, s.tg_query_timeout_s)
    s.artifacts_dir.mkdir(parents=True, exist_ok=True)
    (s.artifacts_dir / "tg_compare.json").write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps(report, indent=2, default=str))
    bad = (not cmp["agree"]) or any(h["hang"] for h in hub_rows)  # type: ignore[index]
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
