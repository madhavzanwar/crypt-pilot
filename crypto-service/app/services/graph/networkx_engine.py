"""In-memory engine over the processed Parquet graph. Used for tests, offline development and as a
clearly labelled fallback (`engine: "networkx"`). Memory: roughly 2 GB for the full Elliptic++ graph."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Literal

import networkx as nx
import pandas as pd

from app.services.graph.base import Exposure, HopCounts, Label, SubNode, WalletInfo, select_subgraph


class NetworkXEngine:
    name: Literal["networkx"] = "networkx"

    def __init__(self, processed_dir: Path, max_frontier: int = 5000) -> None:
        wallets = pd.read_parquet(processed_dir / "wallets.parquet", columns=["address", "label"])
        gf = pd.read_parquet(processed_dir / "graph_features.parquet",
                             columns=["address", "pagerank", "comp_size", "in_deg", "out_deg"])
        edges = pd.read_parquet(processed_dir / "edges.parquet")
        self.labels: dict[str, Label] = dict(zip(wallets["address"], wallets["label"], strict=True))
        self.features = gf.set_index("address")
        self.g = nx.DiGraph()
        self.g.add_nodes_from(self.labels)
        self.g.add_edges_from(edges.itertuples(index=False, name=None))
        self.max_frontier = max_frontier

    @classmethod
    def from_frames(cls, wallets: pd.DataFrame, gf: pd.DataFrame, edges: pd.DataFrame,
                    max_frontier: int = 5000) -> NetworkXEngine:
        self = cls.__new__(cls)
        self.labels = dict(zip(wallets["address"], wallets["label"], strict=True))
        self.features = gf.set_index("address")
        self.g = nx.DiGraph()
        self.g.add_nodes_from(self.labels)
        self.g.add_edges_from(edges[["src", "dst"]].itertuples(index=False, name=None))
        self.max_frontier = max_frontier
        return self

    def ping(self) -> bool:
        return bool(self.g.number_of_nodes() > 0)

    def close(self) -> None:
        return None

    def get_wallet(self, address: str) -> WalletInfo | None:
        label = self.labels.get(address)
        if label is None:
            return None
        if address in self.features.index:
            f = self.features.loc[address].to_dict()
            return WalletInfo(address, label, float(f["pagerank"]), int(f["comp_size"]),
                              int(f["in_deg"]), int(f["out_deg"]))
        return WalletInfo(address, label)

    def _neighbors(self, n: str) -> list[str]:
        return sorted(set(self.g.successors(n)) | set(self.g.predecessors(n)))

    def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
        start = time.perf_counter()
        subject = self.get_wallet(address)
        if subject is None:
            return None
        hop_of: dict[str, int] = {address: 0}
        parent: dict[str, str | None] = {address: None}
        frontier = [address]
        truncated = False
        for h in range(1, max_hop + 1):
            nxt: list[str] = []
            for n in frontier:
                for m in self._neighbors(n):
                    if m in hop_of:
                        continue
                    if len(nxt) >= self.max_frontier:
                        truncated = True
                        break
                    hop_of[m] = h
                    parent[m] = n
                    nxt.append(m)
                if truncated:
                    break
            frontier = nxt
            if not frontier:
                break

        counts = {h: HopCounts() for h in range(1, max_hop + 1)}
        nearest: int | None = None
        for n, h in hop_of.items():
            if h == 0:
                continue
            lab = self.labels[n]
            counts[h].add(lab)
            if lab == "illicit" and (nearest is None or h < nearest):
                nearest = h

        rank = {"illicit": 0, "unknown": 1, "licit": 2}
        order = sorted(hop_of, key=lambda n: (hop_of[n], rank[self.labels[n]], n))
        chosen = select_subgraph(order, parent, max_nodes)
        chosen_set = set(chosen)
        nodes = [SubNode(n, self.labels[n], hop_of[n]) for n in chosen]
        links = sorted((u, v) for u in chosen for v in self.g.successors(u) if v in chosen_set)
        elapsed = (time.perf_counter() - start) * 1000
        return Exposure(subject, counts, nearest, nodes, links, "networkx.khop_exposure", elapsed, truncated)
