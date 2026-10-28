from __future__ import annotations

import asyncio
import hmac
import json
import secrets
from datetime import UTC, datetime
from typing import Any

import anyio
import pandas as pd
from fastapi import APIRouter, Depends, Header, Request

from app.db.models import BenchmarkJob
from app.deps import get_state
from app.errors import ApiError
from app.logging_setup import log
from app.ratelimit import limiter
from app.schemas.contract import (
    BenchmarkJobStatus,
    BenchmarkModelRow,
    BenchmarkResponse,
    BenchmarkRow,
    BenchmarkRunRequest,
    BenchmarkRunResponse,
    ErrorResponse,
)
from app.services.bench.runner import (
    INSTRUCTIONS,
    BenchConfig,
    estimate_tokens,
    raw_dump,
    run_benchmark,
    sample_wallets,
)
from app.services.explain.llm import build_llm
from app.state import AppState

router = APIRouter()
_tasks: set[asyncio.Task[Any]] = set()


def _read(path: Any) -> dict[str, Any] | None:
    return json.loads(path.read_text()) if path.exists() else None


@router.get("/api/benchmark", response_model=BenchmarkResponse, response_model_exclude_none=True)
async def benchmark(state: AppState = Depends(get_state)) -> BenchmarkResponse:
    """Only numbers measured on the real Elliptic++ data are returned; otherwise not_measured."""
    a = state.settings.artifacts_dir
    results, card = _read(a / "benchmark_results.json"), _read(a / "model_card.json")
    results = results if results and results.get("dataSource") == "elliptic++" else None
    card = card if card and card.get("dataSource") == "elliptic++" else None
    if results is None and card is None:
        return BenchmarkResponse(status="not_measured")
    models = []
    if card is not None:
        for name, m in card["models"].items():
            t = m["test"]
            models.append(BenchmarkModelRow(name=name, illicit_f1=t["illicitF1"], precision=t["precision"],
                                            recall=t["recall"], pr_auc=t.get("prAuc")))
    # a row whose provider reported no token usage is left out (never shown as 0): "not measured"
    rows = [BenchmarkRow(method=r["method"], input_tokens=r["inputTokens"], latency_ms=r["latencyMs"],
                         accuracy_pct=r["accuracyPct"])
            for r in (results or {}).get("rows", []) if r.get("inputTokens") is not None]
    measured_at = (results or {}).get("measuredAt") or (card or {}).get("trainedAt")
    return BenchmarkResponse(status="ok", measured_at=measured_at, sample_size=(results or {}).get("sampleSize", 0),
                             rows=rows, models=models)


def _edges(state: AppState) -> pd.DataFrame:
    cached = state.extras.get("bench_edges")
    if cached is None:
        cached = pd.read_parquet(state.settings.processed_dir / "edges.parquet")
        state.extras["bench_edges"] = cached
    return cached


@router.post("/api/benchmark/run", response_model=BenchmarkRunResponse, responses={
    400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 409: {"model": ErrorResponse},
    503: {"model": ErrorResponse}})
@limiter.limit("3/hour")
async def run(request: Request, body: BenchmarkRunRequest, state: AppState = Depends(get_state),
              x_admin_token: str = Header(default="")) -> BenchmarkRunResponse:
    """Spends the owner's LLM budget and is CPU-heavy: in prod it needs the admin token."""
    s = state.settings
    if s.app_env == "prod":
        token = s.admin_token.get_secret_value()
        if not token or token == "change_me" or not hmac.compare_digest(x_admin_token.encode(), token.encode()):  # noqa: S105
            raise ApiError(403, "forbidden")
    if body.sample_size > s.benchmark_max_sample:
        raise ApiError(400, f"sample_size_above_cap_{s.benchmark_max_sample}")
    p = state.pipeline
    if p is None or p.scorer is None:
        raise ApiError(503, "model_not_trained")
    llm = build_llm(s)
    if llm is None:
        raise ApiError(503, "llm_unavailable")
    job_id = "bench_" + secrets.token_hex(8)
    cfg = BenchConfig(sample_size=body.sample_size)
    scorer = p.scorer
    # claim the single job slot atomically (check + insert in one transaction, before any await)
    with state.db.session() as db:
        if db.query(BenchmarkJob).filter(BenchmarkJob.status == "running").first() is not None:
            await llm.aclose()
            raise ApiError(409, "benchmark_running")
        db.add(BenchmarkJob(id=job_id, status="running", progress=0.0, sample_size=cfg.sample_size))

    def finish(status: str, error: str | None) -> None:
        with state.db.session() as db:
            row = db.get(BenchmarkJob, job_id)
            if row is not None:
                row.status, row.error, row.finished_at = status, error, datetime.now(UTC)
                if status == "done":
                    row.progress = 1.0

    def estimate(edges: pd.DataFrame) -> int:
        wallets = sample_wallets(scorer, cfg.sample_size, cfg.seed)
        return sum(estimate_tokens(INSTRUCTIONS + raw_dump(w, scorer, edges)) for w in wallets) * 2

    def progress(frac: float) -> None:
        with state.db.session() as db:
            row = db.get(BenchmarkJob, job_id)
            if row is not None:
                row.progress = round(frac, 3)

    async def job() -> None:
        status, error = "done", None
        try:
            edges = await anyio.to_thread.run_sync(_edges, state)
            if await anyio.to_thread.run_sync(estimate, edges) > s.benchmark_max_tokens:
                raise _BudgetRefused
            await run_benchmark(cfg, scorer, p.engine, edges, llm, s.benchmark_max_tokens,
                                s.artifacts_dir / "benchmark_results.json", p.data_source, progress)
        except _BudgetRefused:
            status, error = "failed", "token_budget_exceeded"
        except asyncio.CancelledError:
            finish("failed", "cancelled")
            await llm.aclose()
            raise
        except Exception as exc:  # any failure is recorded on the job, never raised into the app
            status, error = "failed", type(exc).__name__
            log.error("benchmark_failed", job=job_id, err=type(exc).__name__)
        await llm.aclose()
        finish(status, error)

    task = asyncio.create_task(job())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return BenchmarkRunResponse(job_id=job_id)


class _BudgetRefused(Exception):
    pass


@router.get("/api/benchmark/job/{job_id}", response_model=BenchmarkJobStatus, response_model_exclude_none=True,
            responses={404: {"model": ErrorResponse}})
async def job_status(job_id: str, state: AppState = Depends(get_state)) -> BenchmarkJobStatus:
    with state.db.session() as db:
        row = db.get(BenchmarkJob, job_id[:64])
        if row is None:
            raise ApiError(404, "not_found")
        return BenchmarkJobStatus(status=row.status, progress=row.progress, error=row.error)
