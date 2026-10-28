"""Run the raw_dump vs graph_evidence benchmark from the command line (same code as the API job)."""

from __future__ import annotations

import argparse
import asyncio
import json

import pandas as pd

from app.config import get_settings
from app.db.base import Database
from app.services.bench.runner import BenchConfig, run_benchmark
from app.services.explain.llm import build_llm
from app.services.pipeline import build_pipeline


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample-size", type=int, default=25)
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()
    s = get_settings()
    if args.sample_size > s.benchmark_max_sample:
        raise SystemExit(f"sample size above cap {s.benchmark_max_sample}")
    llm = build_llm(s)
    if llm is None:
        raise SystemExit("set LLM_PROVIDER, LLM_MODEL, LLM_API_KEY first")
    db = Database("sqlite:///:memory:")
    db.create_all()
    p = build_pipeline(s, db)
    if p.scorer is None:
        raise SystemExit("model not trained")
    edges = pd.read_parquet(s.processed_dir / "edges.parquet")
    res = await run_benchmark(BenchConfig(args.sample_size, args.seed), p.scorer, p.engine, edges, llm,
                              s.benchmark_max_tokens, s.artifacts_dir / "benchmark_results.json", p.data_source,
                              lambda f: print(f"progress {f:.0%}"))
    print(json.dumps(res["rows"], indent=2))
    await llm.aclose()


if __name__ == "__main__":
    asyncio.run(main())
