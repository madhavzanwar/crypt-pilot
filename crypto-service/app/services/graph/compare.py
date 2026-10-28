"""Engine comparison, latency measurement and hub-safety checks (used by scripts/compare_engines.py).

Nothing here estimates anything: latency is measured around real calls; differences are listed verbatim.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

from app.services.graph.base import Exposure, GraphEngine, GraphEngineError


@dataclass
class Diff:
    address: str
    field: str
    a: Any
    b: Any


def percentile(sorted_values: list[float], p: float) -> float:
    """Nearest-rank percentile (the smallest value with at least p% of the data at or below it)."""
    if not sorted_values:
        raise ValueError("no values")
    rank = max(1, math.ceil(p / 100 * len(sorted_values)))
    return sorted_values[rank - 1]


def _counts(e: Exposure) -> dict[int, tuple[int, int, int]]:
    return {h: (c.illicit, c.licit, c.unknown) for h, c in sorted(e.counts.items())}


def compare_exposure(address: str, a: Exposure | None, b: Exposure | None, max_nodes: int) -> tuple[list[Diff], bool]:
    """Differences between two engines' answers. Returns (diffs, skipped_detail).

    Counts and the nearest-illicit hop must agree whenever neither side hit its hub cap (a capped frontier is
    an arbitrary subset, so counts legitimately differ). Node/link sets are only compared when neither engine
    truncated and neither reached the node cap.
    """
    diffs: list[Diff] = []
    if a is None or b is None:
        if (a is None) != (b is None):
            diffs.append(Diff(address, "exists", a is not None, b is not None))
        return diffs, False
    if a.subject.label != b.subject.label:
        diffs.append(Diff(address, "subject.label", a.subject.label, b.subject.label))
    if a.truncated or b.truncated:
        return diffs, True  # not comparable: record that it was skipped, never silently pass
    if _counts(a) != _counts(b):
        diffs.append(Diff(address, "counts", _counts(a), _counts(b)))
    if a.nearest_illicit != b.nearest_illicit:
        diffs.append(Diff(address, "nearest_illicit", a.nearest_illicit, b.nearest_illicit))
    if len(a.nodes) < max_nodes and len(b.nodes) < max_nodes:
        ids_a, ids_b = {n.id for n in a.nodes}, {n.id for n in b.nodes}
        if ids_a != ids_b:
            diffs.append(Diff(address, "node_ids", sorted(ids_a ^ ids_b)[:10], "symmetric difference (first 10)"))
        if set(a.links) != set(b.links):
            diffs.append(Diff(address, "links", len(a.links), len(b.links)))
    return diffs, False


def compare_engines(a: GraphEngine, b: GraphEngine, addresses: list[str], max_hop: int, max_nodes: int
                    ) -> dict[str, Any]:
    all_diffs: list[Diff] = []
    skipped: list[str] = []
    errors: list[dict[str, str]] = []
    for addr in addresses:
        try:
            ea = a.khop_exposure(addr, max_hop, max_nodes)
            eb = b.khop_exposure(addr, max_hop, max_nodes)
        except GraphEngineError as exc:
            errors.append({"address": addr, "error": str(exc)})
            continue
        diffs, was_skipped = compare_exposure(addr, ea, eb, max_nodes)
        all_diffs += diffs
        if was_skipped:
            skipped.append(addr)
    return {"checked": len(addresses), "errors": errors, "skipped_truncated": skipped,
            "compared": len(addresses) - len(errors) - len(skipped),
            "diffs": [vars(d) for d in all_diffs], "agree": not all_diffs and not errors}


def measure_latency(engine: GraphEngine, addresses: list[str], calls: int, max_hop: int, max_nodes: int,
                    warmup: int = 3) -> dict[str, Any]:
    """Wall-clock latency of real khop_exposure calls (cycling through addresses), after a short warm-up.

    Reports both the caller's wall time and the engine-reported time (which excludes client overhead).
    """
    if calls < 50:
        raise ValueError("measure at least 50 calls")
    if not addresses:
        raise ValueError("no addresses")
    for i in range(warmup):
        engine.khop_exposure(addresses[i % len(addresses)], max_hop, max_nodes)
    wall: list[float] = []
    inner: list[float] = []
    errors = 0
    for i in range(calls):
        t0 = time.perf_counter()
        try:
            exp = engine.khop_exposure(addresses[i % len(addresses)], max_hop, max_nodes)
        except GraphEngineError:
            errors += 1
            continue
        wall.append((time.perf_counter() - t0) * 1000)
        if exp is not None:
            inner.append(exp.elapsed_ms)
    wall.sort()
    inner.sort()
    out: dict[str, Any] = {"engine": engine.name, "calls": calls, "errors": errors, "warmup_calls": warmup,
                           "distinct_wallets": len(set(addresses[:calls]))}
    if wall:
        out["wall_ms"] = {"p50": round(percentile(wall, 50), 2), "p95": round(percentile(wall, 95), 2),
                          "min": round(wall[0], 2), "max": round(wall[-1], 2)}
    if inner:
        out["engine_reported_ms"] = {"p50": round(percentile(inner, 50), 2), "p95": round(percentile(inner, 95), 2)}
    return out


def hub_check(engine: GraphEngine, hubs: list[tuple[str, int]], max_hop: int, max_nodes: int, timeout_s: float,
              slack_s: float = 5.0) -> list[dict[str, Any]]:
    """Run the highest-degree wallets and record what happened: truncated flag, timing, or a timeout error.

    A call must return or raise within timeout_s + slack_s; anything longer is flagged as a hang.
    """
    rows: list[dict[str, Any]] = []
    for addr, degree in hubs:
        t0 = time.perf_counter()
        row: dict[str, Any] = {"degree": degree}
        try:
            exp = engine.khop_exposure(addr, max_hop, max_nodes)
            row.update(outcome="ok" if exp else "not_found", truncated=bool(exp and exp.truncated),
                       nodes=len(exp.nodes) if exp else 0)
        except GraphEngineError as exc:
            row.update(outcome="engine_error", error=str(exc))
        row["wall_s"] = round(time.perf_counter() - t0, 2)
        row["hang"] = row["wall_s"] > timeout_s + slack_s
        rows.append(row)
    return rows
