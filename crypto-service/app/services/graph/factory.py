"""Build the configured graph engine."""

from __future__ import annotations

from app.config import Settings
from app.services.graph.base import GraphEngine


def build_engine(settings: Settings) -> GraphEngine:
    if settings.graph_engine == "tigergraph":
        if not settings.tg_configured:
            raise RuntimeError("GRAPH_ENGINE=tigergraph but TG_HOST / TG_SECRET (or TG_PASSWORD) are not set")
        from app.services.graph.tigergraph_engine import TigerGraphEngine

        return TigerGraphEngine(
            settings.tg_host, settings.tg_graph, settings.tg_secret.get_secret_value(), settings.tg_username,
            settings.tg_password.get_secret_value(), settings.tg_query_timeout_s, settings.max_frontier)
    from app.services.graph.networkx_engine import NetworkXEngine

    return NetworkXEngine(settings.processed_dir, settings.max_frontier)
