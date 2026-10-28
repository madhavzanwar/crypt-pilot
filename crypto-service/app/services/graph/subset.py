"""Budgeted subset of the graph for a database that cannot hold everything (e.g. a free tier).

Priority order (stops as soon as the vertex budget is reached; the last tier is cut by a seeded sample):
  1. every illicit wallet
  2. their direct neighbours (either direction)
  3. the 2-hop neighbours of illicit wallets
  4. licit wallets, then their direct neighbours
  5. everything else, seeded random sample
Edges are the INDUCED subgraph (both endpoints kept). Exposure counts for a wallet in the subset can be lower
than in the full graph (a neighbour may have been left out), so a subset deployment must be compared with an
engine built from the SAME subset, and responses must carry a limitation line.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import scipy.sparse as sp


def select_subset(wallets: pd.DataFrame, edges: pd.DataFrame, max_vertices: int, seed: int = 42
                  ) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]:
    """wallets: columns address,label. edges: columns src,dst. Returns (wallets, edges, counts per tier)."""
    n = len(wallets)
    if max_vertices >= n:
        return wallets, edges, {"all": n}
    idx = pd.Index(wallets["address"])
    s = idx.get_indexer(edges["src"])
    d = idx.get_indexer(edges["dst"])
    ok = (s >= 0) & (d >= 0)
    a = sp.csr_matrix((np.ones(ok.sum(), dtype=np.int8), (s[ok], d[ok])), shape=(n, n))
    und = (a + a.T).tocsr()

    labels = wallets["label"].to_numpy()
    chosen = np.zeros(n, dtype=bool)
    tiers: dict[str, int] = {}
    rng = np.random.default_rng(seed)

    def add(name: str, mask: np.ndarray) -> bool:
        """Add the tier (cut by a seeded sample if it would overflow). True when the budget is full."""
        new = np.flatnonzero(mask & ~chosen)
        room = max_vertices - int(chosen.sum())
        if len(new) > room:
            new = rng.choice(new, size=room, replace=False)
        chosen[new] = True
        tiers[name] = len(new)
        return int(chosen.sum()) >= max_vertices

    def neighbours(mask: np.ndarray) -> np.ndarray:
        return np.asarray(und.T @ mask.astype(np.int32)).ravel() > 0

    illicit = labels == "illicit"
    full = add("illicit", illicit)
    if not full:
        n1 = neighbours(illicit)
        full = add("illicit_neighbours_1hop", n1)
    if not full:
        full = add("illicit_neighbours_2hop", neighbours(chosen))
    if not full:
        licit = labels == "licit"
        full = add("licit", licit)
        if not full:
            full = add("licit_neighbours", neighbours(licit))
    if not full:
        add("random_rest", np.ones(n, dtype=bool))

    kept = wallets[chosen].reset_index(drop=True)
    keep_set = set(kept["address"])
    sub_edges = edges[edges["src"].isin(keep_set) & edges["dst"].isin(keep_set)].reset_index(drop=True)
    return kept, sub_edges, tiers
