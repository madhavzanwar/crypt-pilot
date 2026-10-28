"""GraphEngine interface. Exposure is computed on the UNDIRECTED graph (money in either direction
counts as exposure) while the returned links keep the original SENT_TO direction."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

Label = Literal["illicit", "licit", "unknown"]


@dataclass
class WalletInfo:
    address: str
    label: Label
    pagerank: float | None = None
    comp_size: int | None = None
    in_deg: int | None = None
    out_deg: int | None = None


@dataclass
class HopCounts:
    illicit: int = 0
    licit: int = 0
    unknown: int = 0

    def add(self, label: str) -> None:
        setattr(self, label, getattr(self, label) + 1)


@dataclass
class SubNode:
    id: str
    label: Label
    hop: int


@dataclass
class Exposure:
    subject: WalletInfo
    counts: dict[int, HopCounts]  # hop -> counts (hop >= 1; subject excluded)
    nearest_illicit: int | None  # hops to nearest illicit wallet (other than subject), None if > max_hop
    nodes: list[SubNode]
    links: list[tuple[str, str]]
    query_name: str
    elapsed_ms: float
    truncated: bool = False
    gsql: str | None = None
    notes: list[str] = field(default_factory=list)


class GraphEngineError(Exception):
    """The engine is unreachable, timed out or returned something unusable."""


class GraphEngine(Protocol):
    @property
    def name(self) -> Literal["tigergraph", "networkx"]: ...

    def ping(self) -> bool: ...

    def get_wallet(self, address: str) -> WalletInfo | None: ...

    def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
        """None if the wallet is not in the graph."""
        ...

    def close(self) -> None: ...


def select_subgraph(order: list[str], parents: dict[str, str | None], max_nodes: int) -> list[str]:
    """Pick up to max_nodes ids in priority order, always including each node's BFS ancestors so
    every shown node connects back to the subject."""
    chosen: dict[str, None] = {}
    for nid in order:
        if len(chosen) >= max_nodes:
            break
        chain = []
        cur: str | None = nid
        while cur is not None and cur not in chosen:
            chain.append(cur)
            cur = parents.get(cur)
        if len(chosen) + len(chain) > max_nodes:
            continue
        for c in reversed(chain):
            chosen[c] = None
    return list(chosen)
