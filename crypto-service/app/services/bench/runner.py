"""Benchmark: raw data dump vs compact graph evidence, same LLM, same instructions.

Both methods hide the wallet's OWN label, the model score and the verdict, so the LLM has to judge
from the inputs (otherwise it would just copy the answer). Ground truth = the dataset label of
test-split wallets (illicit / licit only). Mapping: predicted illicit = WARN or BLOCK; predicted
licit = ALLOW. Input tokens are the provider's REPORTED usage. Latency is end-to-end per method
(building the input, including the graph query for graph_evidence, plus the LLM call).
"""

from __future__ import annotations

import asyncio
import json
import random
import re
import statistics
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from app.errors import UpstreamError
from app.services.datasets.schema import FEATURE_COLUMNS
from app.services.explain.llm import LLMClient
from app.services.graph.base import GraphEngine
from app.services.model.scorer import Scorer

INSTRUCTIONS = (
    "You assess whether paying a Bitcoin wallet is risky, using ONLY the data below from a research dataset. "
    "Neighbour labels come from the dataset (illicit / licit / unknown); the wallet's own label is hidden. "
    'Answer with JSON only: {"verdict": "ALLOW" | "WARN" | "BLOCK", "explanation": "<one or two sentences>"}.'
)
RAW_EDGE_CAP = 300
MAPPING = {"ALLOW": "licit", "WARN": "illicit", "BLOCK": "illicit"}
_VERDICT = re.compile(r'"verdict"\s*:\s*"(ALLOW|WARN|BLOCK)"')


@dataclass
class BenchConfig:
    sample_size: int
    seed: int = 1234
    max_hop: int = 2
    max_nodes: int = 60
    llm_attempts: int = 4  # a transient 503 / 429 must not discard a long run
    retry_delay_s: float = 5.0


def sample_wallets(scorer: Scorer, n: int, seed: int) -> list[str]:
    t = scorer.table
    test = t[(t["split"] == "test") & (t["label"].isin(["illicit", "licit"]))]
    rng = random.Random(seed)
    ill = sorted(test.index[test["label"] == "illicit"])
    lic = sorted(test.index[test["label"] == "licit"])
    k_ill = min(len(ill), n // 2)
    picked = rng.sample(ill, k_ill) + rng.sample(lic, min(len(lic), n - k_ill))
    rng.shuffle(picked)
    return [str(a) for a in picked]


def raw_dump(address: str, scorer: Scorer, edges: pd.DataFrame) -> str:
    values = scorer.table.loc[address, FEATURE_COLUMNS].to_numpy(dtype=float)
    labels = scorer.table["label"]
    near = edges[(edges["src"] == address) | (edges["dst"] == address)]
    nb = set(near["src"]) | set(near["dst"])
    second = edges[edges["src"].isin(nb) | edges["dst"].isin(nb)]
    rows = pd.concat([near, second]).drop_duplicates().head(RAW_EDGE_CAP)

    def lab(a: str) -> str:
        return "hidden" if a == address else str(labels.get(a, "unknown"))

    lines = [f"wallet: {address}", "features:"]
    lines += [f"  {c}={v:g}" for c, v in zip(FEATURE_COLUMNS, values, strict=True)]
    lines.append(f"edges (input_address -> output_address, with dataset labels; first {RAW_EDGE_CAP}):")
    lines += [f"  {s} [{lab(s)}] -> {d} [{lab(d)}]" for s, d in rows.itertuples(index=False, name=None)]
    return "\n".join(lines)


def graph_evidence(address: str, engine: GraphEngine, cfg: BenchConfig) -> str:
    exp = engine.khop_exposure(address, cfg.max_hop, cfg.max_nodes)
    if exp is None:
        return json.dumps({"status": "not_in_dataset"})
    return json.dumps({
        "neighbors": {f"hop{h}": vars(c) for h, c in exp.counts.items()},
        "hopsToNearestIllicit": exp.nearest_illicit,
        "pagerank": None if exp.subject.pagerank is None else f"{exp.subject.pagerank:.8f}",
        "componentSize": exp.subject.comp_size, "inDegree": exp.subject.in_deg, "outDegree": exp.subject.out_deg,
        "truncated": exp.truncated,
    }, sort_keys=True)


def estimate_tokens(text: str) -> int:
    """Rough pre-run estimate (chars / 4) used ONLY for the cost guard, never reported."""
    return len(text) // 4 + 50


def parse_verdict(text: str) -> str | None:
    m = _VERDICT.search(text)
    return m.group(1) if m else None


async def run_benchmark(cfg: BenchConfig, scorer: Scorer, engine: GraphEngine, edges: pd.DataFrame,
                        llm: LLMClient, max_tokens_budget: int, out_path: Path, data_source: str,
                        progress: Callable[[float], None] | None = None) -> dict[str, Any]:
    import anyio

    wallets = sample_wallets(scorer, cfg.sample_size, cfg.seed)
    if len(wallets) < 2:
        raise ValueError("not enough labelled test wallets to sample")
    # cost guard on the raw dumps (the larger input) x 2 methods, before any LLM call
    estimate = sum(estimate_tokens(INSTRUCTIONS + raw_dump(a, scorer, edges)) for a in wallets) * 2
    if estimate > max_tokens_budget:
        raise BudgetExceeded(estimate, max_tokens_budget)

    records: list[dict[str, Any]] = []
    for i, addr in enumerate(wallets):
        truth = str(scorer.table.at[addr, "label"])
        rec: dict[str, Any] = {"address": addr, "datasetLabel": truth}
        for method in ("raw_dump", "graph_evidence"):
            start = time.perf_counter()
            if method == "raw_dump":
                payload = await anyio.to_thread.run_sync(raw_dump, addr, scorer, edges)
            else:
                payload = await anyio.to_thread.run_sync(graph_evidence, addr, engine, cfg)
            error: str | None = None
            res = None
            for attempt in range(cfg.llm_attempts):
                try:
                    res = await llm.complete(INSTRUCTIONS, payload, max_tokens=200)
                    break
                except UpstreamError as exc:
                    error = exc.detail
                    await asyncio.sleep(cfg.retry_delay_s * 2**attempt)
            latency = (time.perf_counter() - start) * 1000
            if res is None:  # still failing after the retries: recorded as failed, never dropped or invented
                rec[method] = {"verdict": None, "inputTokens": None, "outputTokens": None,
                               "latencyMs": round(latency, 1), "correct": False, "error": error}
            else:
                verdict = parse_verdict(res.text)
                rec[method] = {"verdict": verdict, "inputTokens": res.input_tokens, "outputTokens": res.output_tokens,
                               "latencyMs": round(latency, 1),
                               "correct": verdict is not None and MAPPING[verdict] == truth}
        records.append(rec)
        if progress:
            progress((i + 1) / len(wallets))

    rows = []
    for method in ("raw_dump", "graph_evidence"):
        ok_latencies = [r[method]["latencyMs"] for r in records if "error" not in r[method]]
        toks = [r[method]["inputTokens"] for r in records if r[method]["inputTokens"] is not None]
        rows.append({
            "method": method,
            "inputTokens": round(statistics.mean(toks), 1) if toks else None,
            "latencyMs": round(statistics.median(ok_latencies), 1) if ok_latencies else None,
            "accuracyPct": round(100 * sum(r[method]["correct"] for r in records) / len(records), 1),
            "unparseable": sum(r[method]["verdict"] is None and "error" not in r[method] for r in records),
            "failed": sum("error" in r[method] for r in records),
        })
    result = {
        "measuredAt": datetime.now(UTC).isoformat(timespec="seconds"), "dataSource": data_source,
        "sampleSize": len(records), "seed": cfg.seed, "llm": {"provider": llm.provider, "model": llm.model},
        "engine": engine.name,
        "mapping": "predicted illicit = WARN or BLOCK; predicted licit = ALLOW; truth = dataset label (test split)",
        "aggregates": "inputTokens = mean of provider-reported input tokens; latencyMs = median end-to-end; "
                      "accuracyPct = share of ALL sampled wallets whose mapped verdict matches the dataset label "
                      "(failed calls count as wrong); "
                      "failed = calls that still errored after the retries",
        "hidden": "the wallet's own label, the model score and the verdict are hidden from both methods",
        "rawEdgeCap": RAW_EDGE_CAP, "graphMaxHop": cfg.max_hop, "rows": rows, "records": records,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    return result


class BudgetExceeded(Exception):
    def __init__(self, estimate: int, budget: int) -> None:
        super().__init__(f"estimated {estimate} input tokens exceeds BENCHMARK_MAX_TOKENS={budget}")
        self.estimate = estimate
        self.budget = budget
