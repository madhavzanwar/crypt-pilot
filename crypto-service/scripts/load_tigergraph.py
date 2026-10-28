"""Create the schema (if missing) and upsert the processed graph into TigerGraph.

Resumable: a checkpoint file (artifacts/tg_load_checkpoint.json) records finished chunks, so a
re-run after a network error continues where it stopped. Use --subset if the free tier cannot hold
the full graph (see DECISIONS.md "TigerGraph").
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential
from tqdm import tqdm

from app.config import get_settings
from app.services.graph.subset import select_subset
from app.services.graph.tigergraph_engine import GSQL_DIR
from scripts.tg_common import connect

VERTEX_COLS = ["address", "label", "pagerank", "comp_id", "comp_size", "in_deg", "out_deg"]


def subset_tiers(processed: Path, subset: str) -> dict[str, int]:
    """Per-tier vertex counts of a budget subset (empty for the other modes)."""
    if not subset.startswith("budget:"):
        return {}
    _, n, seed = subset.split(":")
    w = pd.read_parquet(processed / "wallets.parquet", columns=["address", "label"])
    return select_subset(w, pd.read_parquet(processed / "edges.parquet"), int(n), int(seed))[2]


def load_frames(processed: Path, subset: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    w = pd.read_parquet(processed / "wallets.parquet", columns=["address", "label"])
    gf = pd.read_parquet(processed / "graph_features.parquet")
    vertices = w.merge(gf, on="address")[VERTEX_COLS]
    edges = pd.read_parquet(processed / "edges.parquet")
    if subset.startswith("budget:"):  # "budget:<max_vertices>:<seed>" (deterministic: verify_graph recomputes it)
        _, n, seed = subset.split(":")
        kept, sub_edges, _tiers = select_subset(vertices[["address", "label"]], edges, int(n), int(seed))
        vertices = vertices[vertices["address"].isin(set(kept["address"]))]
        edges = sub_edges
    elif subset == "labelled-2hop":
        keep = set(vertices.loc[vertices["label"] != "unknown", "address"])
        for _ in range(2):
            touch = edges[edges["src"].isin(keep) | edges["dst"].isin(keep)]
            keep |= set(touch["src"]) | set(touch["dst"])
        vertices = vertices[vertices["address"].isin(keep)]
        edges = edges[edges["src"].isin(keep) & edges["dst"].isin(keep)]
    return vertices.reset_index(drop=True), edges.reset_index(drop=True)


def ensure_schema(conn: object, graph: str) -> None:
    out = str(conn.gsql("LS"))  # type: ignore[attr-defined]
    if f"Graph {graph}" in out or f"- Graph {graph}(" in out:
        print(f"graph {graph} exists")
        return
    print(conn.gsql((GSQL_DIR / "schema.gsql").read_text()))  # type: ignore[attr-defined]


@retry(stop=stop_after_attempt(5), wait=wait_exponential(min=2, max=30), reraise=True)
def _upsert_vertices(conn: object, chunk: pd.DataFrame) -> int:
    return int(conn.upsertVertexDataFrame(chunk, "Wallet", v_id="address",  # type: ignore[attr-defined]
                                          attributes={c: c for c in VERTEX_COLS if c != "address"}))


@retry(stop=stop_after_attempt(5), wait=wait_exponential(min=2, max=30), reraise=True)
def _upsert_edges(conn: object, chunk: pd.DataFrame) -> int:
    return int(conn.upsertEdgeDataFrame(chunk, "Wallet", "SENT_TO", "Wallet",  # type: ignore[attr-defined]
                                        from_id="src", to_id="dst", attributes={}))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chunk", type=int, default=50_000)
    ap.add_argument("--subset", choices=["full", "labelled-2hop"], default="full")
    ap.add_argument("--max-vertices", type=int, default=0,
                    help="free-tier budget: keep all illicit wallets + neighbourhoods first, then sample "
                         "(overrides --subset)")
    ap.add_argument("--seed", type=int, default=42, help="seed for the budget sample")
    ap.add_argument("--reset-checkpoint", action="store_true")
    args = ap.parse_args()
    s = get_settings()
    if args.max_vertices:
        args.subset = f"budget:{args.max_vertices}:{args.seed}"
    ckpt_path = s.artifacts_dir / "tg_load_checkpoint.json"
    ckpt: dict[str, list[int] | str] = {"vertices": [], "edges": [], "subset": args.subset}
    if ckpt_path.exists() and not args.reset_checkpoint:
        ckpt = json.loads(ckpt_path.read_text())
        if ckpt.get("subset") != args.subset:
            raise SystemExit("checkpoint was made with another --subset; use --reset-checkpoint")

    conn = connect()
    ensure_schema(conn, s.tg_graph)
    vertices, edges = load_frames(s.processed_dir, args.subset)
    print(f"subset={args.subset} vertices={len(vertices)} edges={len(edges)}")

    for kind, frame, fn in (("vertices", vertices, _upsert_vertices), ("edges", edges, _upsert_edges)):
        done = set(ckpt[kind])  # type: ignore[arg-type]
        starts = list(range(0, len(frame), args.chunk))
        for start in tqdm(starts, desc=kind):
            if start in done:
                continue
            fn(conn, frame.iloc[start:start + args.chunk])
            ckpt[kind].append(start)  # type: ignore[union-attr]
            ckpt_path.parent.mkdir(parents=True, exist_ok=True)
            ckpt_path.write_text(json.dumps(ckpt))
    (s.artifacts_dir / "tg_load_summary.json").write_text(json.dumps(
        {"subset": args.subset, "vertices": len(vertices), "edges": len(edges),
         "tiers": subset_tiers(s.processed_dir, args.subset),
         "by_label": vertices["label"].value_counts().to_dict()}, indent=2, default=int))
    print("done; now run: make install-queries verify-graph")


if __name__ == "__main__":
    main()
