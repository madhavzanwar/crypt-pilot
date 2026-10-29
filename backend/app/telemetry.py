"""Agent Ops telemetry: every external AI/search call (provider, key label, model, agent, latency, tokens, retries,
fallbacks, sites searched) goes into a ring buffer and a JSONL file, so the dashboard can show how keys and agents behave.
Secrets are never recorded: only the env-var name of the key that was used."""
from __future__ import annotations

import json
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from app.core.paths import writable_dir  # noqa: E402

_FILE = writable_dir(Path(__file__).resolve().parent.parent) / ".telemetry.jsonl"
_MAX = 600
_lock = threading.Lock()
_events: deque[dict] = deque(maxlen=_MAX)
_up: dict[str, bool] = {}  # provider -> last call succeeded; a flip writes an outage / recovery event


def _load() -> None:
    try:
        for line in _FILE.read_text(encoding="utf-8").splitlines()[-_MAX:]:
            _events.append(json.loads(line))
    except Exception:  # noqa: BLE001 - no file yet or a torn line: start with what we have
        pass


_load()


def record(**event) -> dict:
    """kind: call | fallback | cache | search | split | index | outage | recovery. Common fields: provider, key, model, agent, run, ok, ms, tokens, error."""
    event["ts"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _lock:
        _events.append(event)
        prov = event.get("provider")
        if event.get("kind") == "call" and prov and _up.get(prov, True) != bool(event.get("ok")):
            _up[prov] = bool(event.get("ok"))
            _events.append({"kind": "recovery" if event.get("ok") else "outage", "provider": prov, "ts": event["ts"], "agent": event.get("agent"), "error": event.get("error")})
        try:
            with _FILE.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        except OSError:
            pass
    return event


class Timer:
    def __init__(self) -> None:
        self.t0 = time.time()

    @property
    def ms(self) -> int:
        return int((time.time() - self.t0) * 1000)


def events(limit: int = 150) -> list[dict]:
    with _lock:
        return list(_events)[-limit:][::-1]


def _bucket(rows: list[dict], field: str) -> list[dict]:
    out: dict[str, dict] = {}
    for e in rows:
        if e.get("kind") != "call" or not e.get(field):
            continue
        b = out.setdefault(e[field], {"name": e[field], "calls": 0, "errors": 0, "ms": 0, "tokens": 0})
        b.update(last_ok=bool(e.get("ok")), last_ts=e["ts"], last_error=e.get("error"))  # rows are oldest-first: the final write wins
        b["calls"] += 1
        b["errors"] += 0 if e.get("ok") else 1
        b["ms"] += e.get("ms", 0)
        b["tokens"] += e.get("tokens") or 0
    return [{**b, "avg_ms": round(b.pop("ms") / b["calls"]), "success": round(100 * (1 - b["errors"] / b["calls"]))} for b in out.values()]


def summary() -> dict:
    with _lock:
        rows = list(_events)
    return {
        "by_key": _bucket(rows, "key"), "by_model": _bucket(rows, "model"), "by_agent": _bucket(rows, "agent"),
        "fallbacks": sum(e.get("kind") == "fallback" for e in rows), "cache_hits": sum(e.get("kind") == "cache" for e in rows),
        "tokens": sum(e.get("tokens") or 0 for e in rows if e.get("kind") == "call"),
    }


def provider_state() -> dict[str, bool]:
    with _lock:
        return dict(_up)
