"""Background jobs: one endpoint per stage of the Evidence Council, called by the Inngest function (frontend/lib/inngest.ts).

Inngest owns the orchestration (parallel agents, retries, ordering, the run dashboard); each stage here is a plain,
stateless call that reuses the same agent code as the streaming /investigate route. Stages carry their findings in
the request and response because the workers are stateless. Only Inngest may call them: a shared secret in X-Job-Token.
"""
from __future__ import annotations

import hmac
import os
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app import telemetry
from app.core import store
from app.models import AccountRow, TransactionRow
from app.security import agents, ai_agents

router = APIRouter(prefix="/api/jobs/evidence", tags=["jobs"])


def _authorize(x_job_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("INNGEST_JOB_TOKEN")
    if not expected:
        raise HTTPException(503, "Background jobs are not configured (INNGEST_JOB_TOKEN)")
    if not x_job_token or not hmac.compare_digest(x_job_token, expected):
        raise HTTPException(401, "Bad job token")


class Stage(BaseModel):
    run: str
    user_id: str = ""
    agent: str = ""
    findings: list[dict] = []
    board: list[dict] = []  # the other agents' findings, for the AI second opinion
    score: int = 0
    summaries: list[dict] = []
    verdict: dict | None = None
    source: str | None = None
    error: str | None = None


def _ms(t0: float, b: "Stage | None" = None, step: str = "", n: int | None = None) -> int:
    ms = int((time.time() - t0) * 1000)
    if b is not None:
        telemetry.record(kind="stage", run=b.run, agent=b.agent or step, step=step, ms=ms, findings=n)
    return ms


@router.post("/check", dependencies=[Depends(_authorize)])
def check(b: Stage) -> dict:
    """One agent's rule-based pass over the ledger."""
    if b.agent not in agents.CHECKS:
        raise HTTPException(422, f"Unknown agent {b.agent}")
    t0 = time.time()
    findings = agents.CHECKS[b.agent](store.query(TransactionRow, user_id=b.user_id), store.query(AccountRow, user_id=b.user_id))
    return {"findings": findings, "ms": _ms(t0, b, "check", len(findings))}


@router.post("/review", dependencies=[Depends(_authorize)])
def review(b: Stage) -> dict:
    """The agent's own NVIDIA model second-guesses its findings, with the others' findings as context."""
    if b.agent not in ai_agents.MODELS:
        raise HTTPException(422, f"Unknown agent {b.agent}")
    t0 = time.time()
    findings, extra = ai_agents.review(b.agent, b.findings, store.query(TransactionRow, user_id=b.user_id), b.board, b.run)
    return {"findings": findings, "extra": extra, "ms": _ms(t0, b, "review", len(findings))}


@router.post("/web", dependencies=[Depends(_authorize)])
def web(b: Stage) -> dict:
    t0 = time.time()
    agents.cross_check(b.findings)  # so the web lookup targets merchants two agents agree on
    findings, extra = ai_agents.web_evidence(b.findings, b.run)
    return {"findings": findings, "extra": extra, "ms": _ms(t0, b, "web", len(findings))}


@router.post("/score", dependencies=[Depends(_authorize)])
def score(b: Stage) -> dict:
    t0 = time.time()
    agents.cross_check(b.findings)
    value, extra = ai_agents.calibrate(agents.risk_score(b.findings), b.findings, b.run)
    return {"findings": b.findings, "score": value, "extra": {**extra, "score": value}, "ms": _ms(t0, b, "score")}


@router.post("/verdict", dependencies=[Depends(_authorize)])
def verdict(b: Stage) -> dict:
    t0 = time.time()
    v, source, error = agents.verdict_for(b.findings, b.score, b.run)
    return {"verdict": v, "source": source, "error": error, "extra": {"source": source, "error": error}, "ms": _ms(t0, b, "verdict")}


@router.post("/save", dependencies=[Depends(_authorize)])
def save(b: Stage) -> dict:
    """Same saved report the streaming route writes, so the Evidence Room shows it as the latest report."""
    names = {key: name for key, name, _ in agents.AGENTS}
    summaries = [{**s, "name": names.get(s.get("agent"), s.get("agent"))} for s in b.summaries]
    rows = store.query(TransactionRow, user_id=b.user_id)
    report = agents.save_report(b.user_id, b.run, rows, b.findings, b.score, summaries, b.verdict, b.source, b.error)
    return {"run": b.run, "risk_score": report["risk_score"], "risk_level": report["risk_level"], "findings": len(b.findings)}


def enqueue_evidence(user_id: str) -> dict:
    """Send the event that starts the Evidence Council function. Returns the run id the telemetry and report will carry."""
    run = uuid.uuid4().hex[:8]
    dev = bool(os.getenv("INNGEST_DEV"))
    base = os.getenv("INNGEST_BASE_URL") or ("http://127.0.0.1:8288" if dev else "https://inn.gest")
    key = os.getenv("INNGEST_EVENT_KEY") or ("local" if dev else "")
    if not key:
        raise HTTPException(503, "Background jobs are not configured (INNGEST_EVENT_KEY)")
    try:
        r = httpx.post(f"{base}/e/{key}", json={"name": "finpilot/evidence.requested", "data": {"user_id": user_id, "run": run}}, timeout=10)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not reach Inngest") from exc
    telemetry.record(kind="run", run=run, user=user_id, via="inngest", parts=len(agents.AGENTS))
    return {"run": run, "queued": True}
