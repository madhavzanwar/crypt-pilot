"""Create and install every query in app/services/graph/gsql/ (except schema.gsql)."""

from __future__ import annotations

from app.config import get_settings
from app.services.graph.tigergraph_engine import GSQL_DIR
from scripts.tg_common import connect


def main() -> None:
    conn = connect()
    graph = get_settings().tg_graph
    names = []
    for f in sorted(GSQL_DIR.glob("*.gsql")):
        if f.name == "schema.gsql":
            continue
        print(f"creating {f.stem}")
        print(conn.gsql(f"USE GRAPH {graph}\n{f.read_text()}"))
        names.append(f.stem)
    print("installing (this can take a few minutes)")
    print(conn.gsql(f"USE GRAPH {graph}\nINSTALL QUERY {', '.join(names)}"))


if __name__ == "__main__":
    main()
