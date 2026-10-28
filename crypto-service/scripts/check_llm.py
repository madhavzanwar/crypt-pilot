"""Prove the LLM explanation path with REAL calls: one check per demo verdict (EN and HI in one LLM call).

For each wallet it records, as measured: provider-reported input/output tokens, call latency, and whether each
language came from the LLM (passed the groundedness validator) or fell back to the template. Then it points the
client at a dead endpoint to show the template fallback. Writes artifacts/llm_check.json (git-ignored).

Usage: LLM_PROVIDER=... LLM_MODEL=... LLM_API_KEY=... [LLM_BASE_URL=...] uv run python -m scripts.check_llm
       [--deadline 8]   (the production explain deadline in seconds is 8; raise it only for slow local models)
       [--pause 20]     (free tiers rate-limit by tokens per minute; a 429 falls back to the template)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any

from app.config import get_settings
from app.db.base import Database
from app.services.explain.explainer import LLMExplainer
from app.services.explain.llm import LLMClient, LLMResult, build_llm
from app.services.explain.templates import template_en, template_hi
from app.services.pipeline import build_pipeline


class Recorder:
    """Wraps an LLM client and keeps every provider-reported usage figure."""

    def __init__(self, inner: LLMClient) -> None:
        self.inner = inner
        self.provider = inner.provider
        self.model = inner.model
        self.calls: list[LLMResult] = []

    async def complete(self, system: str, user: str, max_tokens: int = 400, temperature: float = 0.0) -> LLMResult:
        res = await self.inner.complete(system, user, max_tokens=max_tokens, temperature=temperature)
        self.calls.append(res)
        return res

    async def aclose(self) -> None:
        await self.inner.aclose()


class Probe(LLMExplainer):
    """Remembers the last evidence so the result can be classified as llm or template."""

    last: dict[str, Any]

    async def explain(self, evidence: dict[str, Any]) -> tuple[str, str]:
        self.last = evidence
        return await super().explain(evidence)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--deadline", type=float, default=8.0)
    ap.add_argument("--pause", type=float, default=0.0, help="seconds to wait between wallets (free-tier rate limits)")
    args = ap.parse_args()
    s = get_settings()
    llm = build_llm(s)
    if llm is None:
        raise SystemExit("set LLM_PROVIDER, LLM_MODEL, LLM_API_KEY (and LLM_BASE_URL) first")
    rec = Recorder(llm)
    probe = Probe(rec, deadline_s=args.deadline)
    db = Database("sqlite:///:memory:")
    db.create_all()
    pipe = build_pipeline(s, db, explainer=probe)
    wallets = json.loads((s.artifacts_dir / "demo_wallets.json").read_text())["wallets"]
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for w in wallets:
        if rows or seen:
            await asyncio.sleep(args.pause)
        n_before = len(rec.calls)
        t0 = time.perf_counter()
        resp = await pipe.compute(w["address"], "en")
        wall = (time.perf_counter() - t0) * 1000
        if resp.verdict in seen:
            continue
        seen.add(resp.verdict)
        ev = probe.last
        row: dict[str, Any] = {
            "verdict": resp.verdict, "wallMs": round(wall, 1), "llmCalls": len(rec.calls) - n_before,
            "enSource": "template" if resp.explanation.en == template_en(ev) else "llm",
            "hiSource": "template" if resp.explanation.hi == template_hi(ev) else "llm"}
        if len(rec.calls) > n_before:
            made = rec.calls[n_before:]
            row.update(inputTokens=[c.input_tokens for c in made], outputTokens=[c.output_tokens for c in made],
                       llmLatencyMs=[round(c.latency_ms, 1) for c in made])
        rows.append(row)
        print(row)
    await rec.aclose()

    # Fallback: same pipeline, unreachable LLM endpoint -> must still answer, from templates.
    dead = get_settings().model_copy(update={"llm_base_url": "http://127.0.0.1:9"})
    dead_llm = build_llm(dead)
    assert dead_llm is not None
    probe2 = Probe(Recorder(dead_llm), deadline_s=args.deadline)
    pipe2 = build_pipeline(dead, db, explainer=probe2)
    t0 = time.perf_counter()
    r2 = await pipe2.compute(wallets[0]["address"], "en")
    fb = {"verdict": r2.verdict, "wallMs": round((time.perf_counter() - t0) * 1000, 1),
          "enSource": "template" if r2.explanation.en == template_en(probe2.last) else "llm",
          "hiSource": "template" if r2.explanation.hi == template_hi(probe2.last) else "llm"}
    print("dead endpoint:", fb)
    out = {"provider": llm.provider, "model": llm.model, "deadlineS": args.deadline, "rows": rows,
           "deadEndpoint": fb}
    (s.artifacts_dir / "llm_check.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
