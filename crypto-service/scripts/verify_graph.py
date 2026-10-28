"""Compare TigerGraph vertex/edge counts (per label) with the processed Parquet files.

Exit code 1 on a mismatch that the recorded load subset does not explain.
"""

from __future__ import annotations

import json
import sys

from app.config import get_settings
from scripts.load_tigergraph import load_frames
from scripts.tg_common import connect


def main() -> None:
    s = get_settings()
    summary_path = s.artifacts_dir / "tg_load_summary.json"
    subset = json.loads(summary_path.read_text())["subset"] if summary_path.exists() else "full"
    vertices, edges = load_frames(s.processed_dir, subset)
    expected = {"vertices": len(vertices), "edges": len(edges),
                "by_label": vertices["label"].value_counts().to_dict()}

    conn = connect()
    stats = conn.runInstalledQuery("graph_stats")
    by_label = {k: int(v) for k, v in stats[0]["by_label"].items()}
    actual = {"vertices": int(conn.getVertexCount("Wallet")),
              "edges": int(conn.getEdgeCount("SENT_TO")), "by_label": by_label}
    report = {"subset": subset, "expected": expected, "actual": actual,
              "match": expected == actual}
    (s.artifacts_dir / "graph_verify.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    sys.exit(0 if report["match"] else 1)


if __name__ == "__main__":
    main()
