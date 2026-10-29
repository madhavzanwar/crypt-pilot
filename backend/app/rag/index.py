"""Per-user in-memory index (chunks + embedding matrix), disk-cached by fingerprint."""
from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path

import numpy as np

from app import telemetry
from app.core.paths import writable_dir
from app.rag import corpus, embed

_CACHE = writable_dir(Path(__file__).resolve().parents[2] / ".cache" / "rag")  # /tmp when the code directory is read-only
_TTL = 30  # shortcut: store edits show up within 30 s; lower it if that hurts
_idx: dict[str, dict] = {}
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()
_offline: set[str] = set()  # users whose embedding failed: served keyword-only until the next call re-embeds


def ensure_indexed(user_id: str) -> dict:
    """Return {fingerprint, chunks, matrix|None, checked}; matrix is None when embeddings are unavailable."""
    with _guard:
        lock = _locks.setdefault(user_id, threading.Lock())
    with lock:
        cur = _idx.get(user_id)
        if cur and cur["matrix"] is not None and time.time() - cur["checked"] < _TTL:
            return cur
        chunks = corpus.build_chunks(user_id)
        # fingerprint of the card texts: covers counts, dates, amounts and document content
        fp = hashlib.sha1("\n".join(f"{c[0]}|{c[2]}" for c in chunks).encode()).hexdigest()
        if cur and cur["fingerprint"] == fp and cur["matrix"] is not None:
            cur["checked"] = time.time()
            return cur
        matrix = _load(user_id, fp)
        if matrix is not None:
            telemetry.record(kind="index", user=user_id, state="from_disk", chunks=len(chunks))
        elif chunks:
            was_offline = user_id in _offline
            try:
                matrix = embed.embed([c[2] for c in chunks], "passage")
                _save(user_id, fp, matrix)
                _offline.discard(user_id)
                telemetry.record(kind="index", user=user_id, state="reindexed_after_outage" if was_offline else "built", chunks=len(chunks))
            except Exception as exc:
                matrix = None  # keyword-only; embedding retried on next call
                _offline.add(user_id)
                telemetry.record(kind="index", user=user_id, state="offline_keyword_only", chunks=len(chunks), error=type(exc).__name__)
        _idx[user_id] = cur = {"fingerprint": fp, "chunks": chunks, "matrix": matrix, "checked": time.time()}
        return cur


def _path(user_id: str) -> Path:
    return _CACHE / f"{hashlib.sha1(user_id.encode()).hexdigest()[:16]}.npz"


def _load(user_id: str, fp: str):
    try:
        z = np.load(_path(user_id))
        return z["matrix"] if str(z["fp"]) == fp else None
    except Exception:
        return None


def _save(user_id: str, fp: str, matrix: np.ndarray) -> None:
    try:
        _CACHE.mkdir(parents=True, exist_ok=True)
        np.savez(_path(user_id), fp=fp, matrix=matrix)
    except OSError:
        pass
