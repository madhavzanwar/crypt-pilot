"""One smoke check per installed GSQL query, on a real wallet. Run after `make install-queries`.

    uv run python -m scripts.smoke_queries
Exit 1 if any query fails to run or returns an unexpected shape (the message says which and why).
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from typing import Any

import pandas as pd

from app.config import get_settings
from app.services.graph.tigergraph_engine import TigerGraphEngine, parse_khop_result
from scripts.tg_common import connect


def main() -> None:
    s = get_settings()
    conn = connect()
    wallets = pd.read_parquet(s.processed_dir / "wallets.parquet", columns=["address", "label"])
    seed = str(wallets.loc[wallets["label"] == "illicit", "address"].iloc[0])
    results: list[tuple[str, bool, str]] = []

    def check(name: str, fn: Callable[[], str]) -> None:
        try:
            results.append((name, True, fn()))
        except Exception as exc:  # report every failure; the GSQL error text is the useful part
            results.append((name, False, f"{type(exc).__name__}: {str(exc)[:400]}"))

    def wallet_summary() -> str:
        out: Any = conn.runInstalledQuery("wallet_summary", {"seed": (seed,)})
        w = out[0]["wallet"][0]["attributes"]
        assert w["label"] == "illicit" and w["address"] == seed, w
        return f"label={w['label']} comp_size={w['comp_size']}"

    def graph_stats() -> str:
        out: Any = conn.runInstalledQuery("graph_stats")
        by = out[0]["by_label"]
        assert set(by) <= {"illicit", "licit", "unknown"} and sum(by.values()) > 0, by
        return json.dumps(by)

    def khop() -> str:
        out: Any = conn.runInstalledQuery(
            "khop_exposure", TigerGraphEngine.query_params(seed, 2, 30, s.max_frontier))
        _counts, nearest, trunc, nodes, links = parse_khop_result(out, 2)
        assert any(n.id == seed and n.hop == 0 for n in nodes), "seed missing from returned nodes"
        assert len(nodes) <= 30
        return f"nodes={len(nodes)} links={len(links)} nearest={nearest} truncated={trunc}"

    check("wallet_summary", wallet_summary)
    check("graph_stats", graph_stats)
    check("khop_exposure", khop)
    for name, ok, note in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name:16s} {note}")
    sys.exit(0 if all(ok for _, ok, _ in results) else 1)


if __name__ == "__main__":
    main()
