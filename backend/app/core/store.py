"""Firestore access for the SQLModel row classes in app.models.

Collection = Model.__tablename__, document id = row.id. Rows are stored as
JSON-mode dicts (ISO date strings), so reads go through model_validate -- never
Model(**d), which doesn't coerce types on table=True models.

Provides an automatic in-memory fallback store when running on Vercel or locally
without Firebase service account credentials so the application never crashes.
"""
from __future__ import annotations

import json
import logging
import os
import time
from functools import lru_cache

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_BATCH = 500

# Read cache. A write invalidates only that table's cached reads (`_versions`), and `put` writes its rows through
# into those entries, so a payment does not force a cold re-read of every transaction. The TTL also covers writes
# made by another process. Rows that are only derived or logged never invalidate. `_writes` is the global change
# counter the live-sync endpoint reports.
_TTL = 0.0 if os.getenv("FINPILOT_NO_CACHE") else float(os.getenv("FINPILOT_CACHE_TTL", "5" if os.getenv("VERCEL") else "300"))  # every write goes through this process (write-through), so a long TTL only bounds cross-instance staleness (serverless runs many instances, so it defaults to 5s there)
_QUIET = {"insights_snapshots", "copilot_insights", "audit_logs", "investigations"}
_writes = 0
_versions: dict[str, int] = {}
_reads: dict[tuple, tuple[int, float, list]] = {}


def writes() -> int:
    """Counter that changes whenever user data is written; use it to validate your own caches."""
    return _writes


def _touch_live(rows) -> None:
    """Shared change marker, so a write on one serverless instance is visible to the live-sync poll answered by another."""
    db = _db()
    if db is None:
        return
    uids = {getattr(r, "user_id", None) for r in rows if type(r).__tablename__ not in _QUIET} - {None}
    for uid in uids:
        try:
            db.collection("live_versions").document(uid).set({"v": time.time_ns() // 1_000_000})
        except Exception as exc:  # never fail a real write because the marker failed
            logger.warning("live marker not updated: %s", exc)


def live_version(user_id: str) -> int:
    """Changes whenever any of this user's data is written, on any instance; falls back to the local counter without Firestore."""
    db = _db()
    if db is None:
        return _writes
    snap = db.collection("live_versions").document(user_id).get()
    return int((snap.to_dict() or {}).get("v", 0)) if snap.exists else 0


def _bump(tablename: str) -> None:
    global _writes
    if tablename not in _QUIET:
        _writes += 1
        _versions[tablename] = _versions.get(tablename, 0) + 1


def _write_through(rows) -> None:
    """Bump each written table and patch its still-current cached reads with the new rows."""
    by_table: dict[str, list] = {}
    for r in rows:
        by_table.setdefault(type(r).__tablename__, []).append(r)
    for table, group in by_table.items():
        old = _versions.get(table, 0)
        _bump(table)
        if table in _QUIET:
            continue
        ids = {r.id for r in group}
        for key, (ver, at, cached) in list(_reads.items()):
            if key[0] != table or ver != old:
                continue  # already stale: the next read refetches
            eq = dict(key[1])
            fresh = [r for r in cached if r.id not in ids] + [r.model_copy() for r in group if all(getattr(r, k, None) == v for k, v in eq.items())]
            _reads[key] = (_versions[table], at, fresh)


# In-memory fallback when Firestore credentials are not configured or available.
_memory_store: dict[str, dict[str, dict]] = {}


@lru_cache
def _db():
    # Lazy so pure tests never need credentials or an emulator.
    pid = get_settings().firestore_project_id
    if os.getenv("FIRESTORE_EMULATOR_HOST"):
        try:
            from google.cloud import firestore as gcf

            return gcf.Client(project=pid)  # anonymous creds, auto-routed to the emulator
        except Exception as exc:
            logger.warning("Firestore emulator client failed: %s; using memory store fallback.", exc)
            return None

    info = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as admin_firestore

        if info:
            try:
                cred = credentials.Certificate(json.loads(info))
            except Exception as exc:
                logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed: %s", exc)
                return None
        else:
            try:
                cred = credentials.ApplicationDefault()
            except Exception:
                logger.info("No Firebase service account found; using in-memory store fallback.")
                return None

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"projectId": pid})
        return admin_firestore.client()
    except Exception as exc:
        logger.warning("Firestore initialization failed: %s; using in-memory store fallback.", exc)
        return None


def _coll(model):
    db = _db()
    return db.collection(model.__tablename__) if db is not None else None


def _q(model, eq):
    from google.cloud.firestore_v1.base_query import FieldFilter

    q = _coll(model)
    for k, v in eq.items():
        q = q.where(filter=FieldFilter(k, "==", v))
    return q


def get(model, id: str):
    db = _db()
    if db is None:
        table = model.__tablename__
        data = _memory_store.get(table, {}).get(id)
        return model.model_validate(data) if data is not None else None
    snap = _coll(model).document(id).get()
    return model.model_validate(snap.to_dict()) if snap.exists else None


def query(model, **eq) -> list:
    key = (model.__tablename__, tuple(sorted(eq.items())))
    ttl = 0.0 if model.__tablename__ in _QUIET else _TTL  # logs/derived rows are read live
    hit = _reads.get(key)
    if hit and hit[0] == _versions.get(model.__tablename__, 0) and time.monotonic() - hit[1] < ttl:
        return [r.model_copy() for r in hit[2]]  # copies: callers edit rows before put()
    seen = _versions.get(model.__tablename__, 0)  # a write during the read leaves this entry already stale
    if _db() is None:
        rows = [model.model_validate(d) for d in _memory_store.get(model.__tablename__, {}).values() if all(d.get(k) == v for k, v in eq.items())]
    else:
        rows = [model.model_validate(s.to_dict()) for s in _q(model, eq).stream()]
    if ttl:
        _reads[key] = (seen, time.monotonic(), rows)
        return [r.model_copy() for r in rows]
    return rows


def first(model, **eq):
    db = _db()
    if db is None:
        table = model.__tablename__
        for r in _memory_store.get(table, {}).values():
            if all(r.get(k) == v for k, v in eq.items()):
                return model.model_validate(r)
        return None
    for s in _q(model, eq).limit(1).stream():
        return model.model_validate(s.to_dict())
    return None


def put(*rows) -> None:
    """Upsert rows; split into batches of 500 (atomic per batch, not across them)."""
    db = _db()
    if db is None:
        for r in rows:
            table = type(r).__tablename__
            _memory_store.setdefault(table, {})[r.id] = r.model_dump(mode="json")
        _write_through(rows)
        return
    for i in range(0, len(rows), _BATCH):
        batch = db.batch()
        for r in rows[i : i + _BATCH]:
            batch.set(_coll(type(r)).document(r.id), r.model_dump(mode="json"))
        batch.commit()
    _write_through(rows)
    _touch_live(rows)


def delete(model, id: str) -> None:
    db = _db()
    if db is None:
        _memory_store.get(model.__tablename__, {}).pop(id, None)
        _bump(model.__tablename__)
        return
    _coll(model).document(id).delete()
    _bump(model.__tablename__)


def delete_where(model, **eq) -> None:
    db = _db()
    if db is None:
        table = model.__tablename__
        store_table = _memory_store.get(table, {})
        to_del = [rid for rid, r in store_table.items() if all(r.get(k) == v for k, v in eq.items())]
        for rid in to_del:
            store_table.pop(rid, None)
        _bump(model.__tablename__)
        return
    refs = [s.reference for s in _q(model, eq).stream()]
    for i in range(0, len(refs), _BATCH):
        batch = db.batch()
        for ref in refs[i : i + _BATCH]:
            batch.delete(ref)
        batch.commit()
    _bump(model.__tablename__)
