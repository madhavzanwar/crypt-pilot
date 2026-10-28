"""Replay store: REAL responses recorded by scripts/record_replays.py for the demo wallets.

Files: artifacts/replay/<address>__<lang>.json = {"recordedAt": ..., "response": CheckResponse JSON}.
Never hand-edited. Served with engine="replay", replay=true and a limitation line.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_SAFE = re.compile(r"^[A-Za-z0-9-]{1,100}$")


def replay_path(replay_dir: Path, address: str, lang: str) -> Path | None:
    if not _SAFE.match(address) or lang not in ("en", "hi"):
        return None
    return replay_dir / f"{address}__{lang}.json"


class ReplayStore:
    def __init__(self, replay_dir: Path) -> None:
        self.dir = replay_dir

    def get(self, address: str, lang: str) -> dict[str, Any] | None:
        p = replay_path(self.dir, address, lang)
        if p is None or not p.exists():
            return None
        data: dict[str, Any] = json.loads(p.read_text())
        return data

    def put(self, address: str, lang: str, recorded_at: str, response: dict[str, Any]) -> Path:
        p = replay_path(self.dir, address, lang)
        if p is None:
            raise ValueError("unsafe address for a replay file name")
        self.dir.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"recordedAt": recorded_at, "response": response}, indent=2, ensure_ascii=False))
        return p

    def count(self) -> int:
        return len(list(self.dir.glob("*.json"))) if self.dir.exists() else 0
