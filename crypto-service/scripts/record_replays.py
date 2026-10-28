"""Record REAL responses for the demo wallets (both languages) into artifacts/replay/.

Runs the actual pipeline in-process against the configured engine (normally TigerGraph). Refuses to
record when DEMO_REPLAY=true. Files are written by code only; never hand-edit them.
"""

from __future__ import annotations

import asyncio
import json

from app.config import get_settings
from app.db.base import Database
from app.schemas.contract import to_wire
from app.services.pipeline import build_pipeline, now_iso


async def main() -> None:
    s = get_settings()
    if s.demo_replay:
        raise SystemExit("DEMO_REPLAY=true: replays must be recorded from a live engine")
    db = Database("sqlite:///:memory:")
    db.create_all()
    pipeline = build_pipeline(s, db)
    if pipeline.scorer is None:
        raise SystemExit("model not trained: run make train first")
    if not await pipeline.engine_ok():
        raise SystemExit(f"engine {pipeline.engine.name} is not reachable")
    wallets = json.loads((s.artifacts_dir / "demo_wallets.json").read_text())["wallets"]
    for w in wallets:
        for lang in ("en", "hi"):
            resp = await pipeline.compute(w["address"], lang)  # type: ignore[arg-type]
            path = pipeline.replay.put(w["address"], lang, now_iso(), to_wire(resp))
            print(f"{resp.verdict:7s} {resp.engine:10s} {resp.tigergraph.ms:8.1f} ms  -> {path}")
    await pipeline.aclose()


if __name__ == "__main__":
    asyncio.run(main())
