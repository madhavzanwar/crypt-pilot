"""TigerGraph engine (primary) via pyTigerGraph 2.x.

- Auth: GSQL secret (TigerGraph Cloud / Savanna) -> REST++ token; or username/password.
- Every call has a hard client-side deadline (pyTigerGraph sets no HTTP timeout by default) plus the
  server-side GSQL-TIMEOUT header, so a slow cluster can never hang a request.
- `elapsed_ms` is measured around the TigerGraph calls only.
"""

from __future__ import annotations

import concurrent.futures as cf
import threading
import time
from pathlib import Path
from typing import Any, Literal

from app.services.graph.base import Exposure, GraphEngineError, HopCounts, Label, SubNode, WalletInfo

GSQL_DIR = Path(__file__).parent / "gsql"
_LABELS: set[str] = {"illicit", "licit", "unknown"}


def _label(v: Any) -> Label:
    s = str(v)
    return s if s in _LABELS else "unknown"  # type: ignore[return-value]


def parse_khop_result(result: list[dict[str, Any]], max_hop: int) -> tuple[
        dict[int, HopCounts], int | None, bool, list[SubNode], list[tuple[str, str]]]:
    """Parse the three PRINT blocks of khop_exposure.gsql."""
    merged: dict[str, Any] = {}
    for block in result:
        merged.update(block)
    counts = {h: HopCounts() for h in range(1, max_hop + 1)}
    for key, n in (merged.get("counts") or {}).items():
        hop_s, _, lab = str(key).partition(":")
        hop = int(hop_s.lstrip("h"))
        if hop in counts and lab in _LABELS:
            setattr(counts[hop], lab, int(n))
    nearest_raw = int(merged.get("nearest_illicit", 9999))
    nearest = nearest_raw if nearest_raw <= max_hop else None
    truncated = bool(merged.get("truncated", False))
    nodes = []
    for v in merged.get("nodes") or []:
        attrs = v.get("attributes", v)
        nodes.append(SubNode(str(attrs.get("address", v.get("v_id"))), _label(attrs.get("label")),
                             int(attrs.get("hop", 0))))
    links = sorted({(str(e["from_id"]), str(e["to_id"])) for e in merged.get("edges") or []})
    return counts, nearest, truncated, nodes, links


class TigerGraphEngine:
    name: Literal["tigergraph"] = "tigergraph"

    def __init__(self, host: str, graph: str, secret: str = "", username: str = "", password: str = "",
                 timeout_s: float = 8.0, max_frontier: int = 5000) -> None:
        from pyTigerGraph import TigerGraphConnection

        self.timeout_s = timeout_s
        self.max_frontier = max_frontier
        kwargs: dict[str, Any] = {"host": host, "graphname": graph}
        if username:
            kwargs.update(username=username, password=password)
        if secret:
            kwargs["gsqlSecret"] = secret
        self.conn = TigerGraphConnection(**kwargs)
        self._secret = secret
        self._lock = threading.Lock()
        self._token_ok = False
        self._pool = cf.ThreadPoolExecutor(max_workers=8, thread_name_prefix="tg")
        self.conn.customizeHeader(timeout=int(timeout_s * 1000), responseSize=32_000_000)
        self.khop_gsql = (GSQL_DIR / "khop_exposure.gsql").read_text()

    # ------------------------------------------------------------------ plumbing
    def _ensure_token(self) -> None:
        if self._token_ok or not self._secret:
            return
        with self._lock:
            if not self._token_ok:
                self.conn.getToken(self._secret)
                self._token_ok = True

    def _call(self, fn: Any, *args: Any, **kwargs: Any) -> Any:
        def run() -> Any:
            self._ensure_token()
            return fn(*args, **kwargs)

        fut = self._pool.submit(run)
        try:
            return fut.result(timeout=self.timeout_s)
        except cf.TimeoutError as exc:
            raise GraphEngineError(f"tigergraph timeout after {self.timeout_s}s") from exc
        except Exception as exc:  # pyTigerGraph raises TigerGraphException / requests errors
            raise GraphEngineError(f"tigergraph error: {type(exc).__name__}") from exc

    def close(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)

    # ------------------------------------------------------------------ API
    def ping(self) -> bool:
        try:
            self._call(self.conn.getVer)
        except GraphEngineError:
            return False
        return True

    def _vertex(self, address: str) -> dict[str, Any] | None:
        try:
            rows = self._call(self.conn.getVerticesById, "Wallet", [address])
        except GraphEngineError as exc:
            # Unlike NetworkX, TigerGraph answers an id that is not in the graph with error 601 instead of an
            # empty list. That means "not in the dataset" (UNKNOWN), not "engine failure".
            if "is not a valid vertex id" in str(exc.__cause__):
                return None
            raise
        if not rows:
            return None
        row: dict[str, Any] = rows[0]
        attrs: dict[str, Any] = row.get("attributes", {})
        return attrs

    @staticmethod
    def _info(address: str, attrs: dict[str, Any]) -> WalletInfo:
        return WalletInfo(address, _label(attrs.get("label")), float(attrs.get("pagerank", 0.0)),
                          int(attrs.get("comp_size", 0)), int(attrs.get("in_deg", 0)),
                          int(attrs.get("out_deg", 0)))

    def get_wallet(self, address: str) -> WalletInfo | None:
        attrs = self._vertex(address)
        return None if attrs is None else self._info(address, attrs)

    @staticmethod
    def query_params(address: str, max_hop: int, max_nodes: int, max_frontier: int) -> dict[str, Any]:
        """VERTEX<T> parameters must be 1-tuples: the plain-value form is deprecated in pyTigerGraph 2.x and every
        call is first rejected (REST-30000) and then retried, which doubles the round trips."""
        return {"seed": (address,), "max_hop": max_hop, "max_nodes": max_nodes, "max_frontier": max_frontier}

    def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
        start = time.perf_counter()
        attrs = self._vertex(address)
        if attrs is None:
            return None
        result = self._call(
            self.conn.runInstalledQuery, "khop_exposure",
            self.query_params(address, max_hop, max_nodes, self.max_frontier),
            timeout=int(self.timeout_s * 1000),
        )
        elapsed = (time.perf_counter() - start) * 1000
        try:
            counts, nearest, truncated, nodes, links = parse_khop_result(result, max_hop)
        except (KeyError, TypeError, ValueError) as exc:
            raise GraphEngineError("unexpected khop_exposure output") from exc
        subject = self._info(address, attrs)
        if not any(n.id == address for n in nodes):
            nodes.insert(0, SubNode(address, subject.label, 0))
        return Exposure(subject, counts, nearest, nodes, links, "khop_exposure", elapsed, truncated,
                        gsql=self.khop_gsql)
