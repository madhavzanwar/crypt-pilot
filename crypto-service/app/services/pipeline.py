"""The /api/check pipeline shared by the JSON and SSE endpoints.

prepare()  -> validate input (secret guard, checksum) and the credit gate (402) BEFORE any work
execute()  -> async generator of Step events at real stage boundaries, ending in a Result
compute()  -> evidence + response without charging (used by execute() and record_replays.py)
Charging happens only after the response exists, in the same DB transaction as the check log,
and only for status "ok" responses that are not cache hits.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

import anyio
import httpx

from app.config import Settings
from app.db.base import Database
from app.db.models import CheckLog
from app.errors import ApiError
from app.logging_setup import hash_address, log
from app.schemas.contract import (
    CheckResponse,
    Counts,
    Explanation,
    GraphFeatures,
    GraphLink,
    GraphNode,
    LabelHits,
    ModelInfo,
    Neighbors,
    Subgraph,
    TigerGraphInfo,
)
from app.services.address import InvalidAddressError, SecretInputError, guard_secret, validate_address
from app.services.billing import ledger
from app.services.cache import TTLCache
from app.services.graph.base import Exposure, GraphEngine, GraphEngineError
from app.services.graph.replay import ReplayStore
from app.services.labels.lists import LabelLists
from app.services.model.policy import decide
from app.services.model.reasons import ReasonInput, build_reasons
from app.services.model.scorer import Scorer
from app.services.report_hash import report_hash
from app.services.voice.tts import TTS

Lang = Literal["en", "hi"]

STEPS: list[tuple[str, str]] = [
    ("validate", "Validating address"),
    ("graph", "Querying TigerGraph"),
    ("hops", "Measuring hops to flagged wallets"),
    ("score", "Scoring risk"),
    ("explain", "Writing explanation"),
]


class Explainer(Protocol):
    name: str

    async def explain(self, evidence: dict[str, Any]) -> tuple[str, str]: ...

    async def aclose(self) -> None: ...


@dataclass
class Step:
    id: str
    label: str


@dataclass
class Result:
    response: CheckResponse | None
    http_status: int = 200
    error: str | None = None  # set (with response None) for 402 no_credits after a race


@dataclass
class Prepared:
    address: str
    lang: Lang
    session_id: str


class CheckPipeline:
    def __init__(self, settings: Settings, db: Database, engine: GraphEngine, scorer: Scorer | None,
                 labels: LabelLists, explainer: Explainer, replay: ReplayStore, tts: TTS | None = None) -> None:
        self.s = settings
        self.db = db
        self.engine = engine
        self.scorer = scorer
        self.labels = labels
        self.explainer = explainer
        self.replay = replay
        self.tts = tts if tts is not None and tts.configured else None
        self.usage_hook: Callable[[str], Awaitable[None]] | None = None
        self._tasks: set[asyncio.Future[Any]] = set()
        self._inflight: dict[str, tuple[asyncio.Lock, int]] = {}
        self.cache: TTLCache[dict[str, Any]] = TTLCache(settings.cache_ttl_seconds)
        self.data_source = scorer.data_source if scorer else "not_loaded"
        self.tg_subset = self._read_tg_subset()
        self.dataset_name = {"synthetic_fixture": "synthetic fixture", "elliptic++": "Elliptic++"}.get(
            self.data_source, "research")

    def _read_tg_subset(self) -> str | None:
        p = self.s.artifacts_dir / "tg_load_summary.json"
        if self.engine.name != "tigergraph" or not p.exists():
            return None
        subset = json.loads(p.read_text()).get("subset")
        return None if subset == "full" else str(subset)

    async def engine_ok(self) -> bool:
        return await anyio.to_thread.run_sync(self.engine.ping)

    async def aclose(self) -> None:
        await self.explainer.aclose()
        self.engine.close()

    # ------------------------------------------------------------------ gate
    def prepare(self, raw_address: str, lang: Lang, session_id: str) -> Prepared:
        try:
            guard_secret(raw_address, address_field=True)
        except SecretInputError as exc:
            raise ApiError(400, "secret_input") from exc
        try:
            info = validate_address(raw_address, allow_demo=self.s.demo_mode)
        except InvalidAddressError as exc:
            raise ApiError(400, "invalid_address") from exc
        with self.db.session() as s:
            ledger.ensure_session(s, session_id, self.s.starting_credits)
            if ledger.balance(s, session_id) <= 0:
                raise ApiError(402, "no_credits")
        return Prepared(info.address, lang, session_id)

    # ------------------------------------------------------------------ run
    async def execute(self, p: Prepared) -> AsyncIterator[Step | Result]:
        """Single-flight per address+lang: identical concurrent requests (double click, StrictMode
        double effect, retry) queue behind the first one and are then served from the cache, uncharged."""
        key = f"{p.address}|{p.lang}"
        lock, _ = self._inflight.get(key, (asyncio.Lock(), 0))
        self._inflight[key] = (lock, self._inflight.get(key, (lock, 0))[1] + 1)
        try:
            async with lock:
                async for ev in self._execute_locked(p):
                    yield ev
        finally:
            lock, n = self._inflight[key]
            if n <= 1:
                del self._inflight[key]
            else:
                self._inflight[key] = (lock, n - 1)

    async def _execute_locked(self, p: Prepared) -> AsyncIterator[Step | Result]:
        yield Step(*STEPS[0])
        cached = self.cache.get(f"{p.address}|{p.lang}")
        if cached is not None:
            resp = CheckResponse.model_validate(cached)
            resp.cached = True
            resp.credits_remaining = self._balance(p.session_id)
            self._log(p, resp.verdict, "cache", charged=False)
            yield Result(resp)
            return

        if self.s.demo_replay:
            replayed = self._replay(p)
            if replayed is not None:
                async for ev in self._finish(p, replayed, charge=replayed.status == "ok"):
                    yield ev
                return

        graph_label = "Querying TigerGraph" if self.engine.name == "tigergraph" else \
            f"Querying graph ({self.engine.name} fallback)"
        yield Step("graph", graph_label)
        try:
            t0 = time.perf_counter()
            exposure = await anyio.to_thread.run_sync(
                self.engine.khop_exposure, p.address, self.s.max_hop, self.s.max_subgraph_nodes)
            lookup_ms = (time.perf_counter() - t0) * 1000
        except GraphEngineError as exc:
            log.warning("graph_engine_failed", engine=self.engine.name, err=str(exc),
                        addr=hash_address(p.address))
            replayed = self._replay(p) if self.s.replay_fallback else None
            if replayed is not None:
                async for ev in self._finish(p, replayed, charge=replayed.status == "ok"):
                    yield ev
                return
            yield Result(self._error_response(p, "graph_unavailable"), 503)
            return

        yield Step(*STEPS[2])
        if self.scorer is None:
            yield Result(self._error_response(p, "model_not_trained"), 503)
            return
        yield Step(*STEPS[3])
        evidence, resp = self._assemble(p, exposure, lookup_ms)
        yield Step(*STEPS[4])
        en, hi = await self.explainer.explain(evidence)
        resp.explanation = Explanation(en=en, hi=hi)
        if self.tts is not None:
            resp.audio_url = await self.tts.synthesize(en if p.lang == "en" else hi, p.lang)
        self.cache.set(f"{p.address}|{p.lang}", resp.model_dump(mode="json", exclude={"credits_remaining"}))
        async for ev in self._finish(p, resp, charge=resp.status == "ok"):
            yield ev

    async def compute(self, address: str, lang: Lang) -> CheckResponse:
        """Full response without charging or caching (for record_replays.py)."""
        t0 = time.perf_counter()
        exposure = await anyio.to_thread.run_sync(self.engine.khop_exposure, address, self.s.max_hop,
                                                  self.s.max_subgraph_nodes)
        evidence, resp = self._assemble(Prepared(address, lang, "-"), exposure,
                                        (time.perf_counter() - t0) * 1000)
        en, hi = await self.explainer.explain(evidence)
        resp.explanation = Explanation(en=en, hi=hi)
        return resp

    # ------------------------------------------------------------------ helpers
    async def _finish(self, p: Prepared, resp: CheckResponse, charge: bool) -> AsyncIterator[Result]:
        with anyio.CancelScope(shield=True):  # a client disconnect cannot half-apply the charge
            remaining = self._persist(p, resp, charge)
        if remaining is None:  # another request spent the last credit while this one ran
            yield Result(None, 402, "no_credits")
            return
        resp.credits_remaining = remaining
        if charge and self.usage_hook is not None:
            self._spawn(self.usage_hook(p.session_id))
        yield Result(resp)

    def _spawn(self, coro: Any) -> None:
        """Fire-and-forget (usage reporting); failures are logged and never affect the check."""
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _persist(self, p: Prepared, resp: CheckResponse, charge: bool) -> int | None:
        check_id = "chk_" + secrets.token_hex(8)
        with self.db.session() as s:
            if charge:
                remaining = ledger.try_charge(s, p.session_id, check_id)
                if remaining is None:
                    return None
            else:
                remaining = ledger.balance(s, p.session_id)
            s.add(CheckLog(id=check_id, session_id=p.session_id, address_hash=hash_address(p.address),
                           verdict=resp.verdict, engine=resp.engine or "-", charged=int(charge)))
        log.info("check", addr=hash_address(p.address), verdict=resp.verdict, status=resp.status,
                 engine=resp.engine, charged=charge)
        return remaining

    def _log(self, p: Prepared, verdict: str, engine: str | None, charged: bool) -> None:
        with self.db.session() as s:
            s.add(CheckLog(id="chk_" + secrets.token_hex(8), session_id=p.session_id,
                           address_hash=hash_address(p.address), verdict=verdict,
                           engine=engine or "-", charged=int(charged)))

    def _balance(self, session_id: str) -> int:
        with self.db.session() as s:
            return ledger.balance(s, session_id)

    def _replay(self, p: Prepared) -> CheckResponse | None:
        rec = self.replay.get(p.address, p.lang)
        if rec is None:
            return None
        resp = CheckResponse.model_validate(rec["response"])
        resp.engine = "replay"
        resp.replay = True
        resp.cached = False
        resp.limitations = [*resp.limitations,
                            f"Pre-recorded real response from {rec['recordedAt']} (demo safety replay); "
                            "timings were measured when it was recorded."]
        return resp

    def _model_info(self) -> ModelInfo:
        if self.scorer is None:
            return ModelInfo(name="not_loaded", illicit_f1_test=None)
        return ModelInfo(name=f"xgboost-{self.scorer.model_name}", illicit_f1_test=self.scorer.illicit_f1_test)

    def _base_limitations(self) -> list[str]:
        lim = ["Risk signal, not an accusation.",
               f"Based on the {self.dataset_name} research dataset of historical Bitcoin activity, not the live "
               "blockchain." if self.data_source != "synthetic_fixture" else
               "Based on a synthetic research-style dataset, not the live blockchain.",
               "Dataset labels come from the dataset authors and can be incomplete or wrong."]
        if self.data_source == "synthetic_fixture":
            lim.insert(0, "Synthetic demo data: these are not real wallets.")
        if self.engine.name != "tigergraph":
            lim.append(f"Graph answered by the {self.engine.name} fallback engine, not TigerGraph.")
        if self.tg_subset:
            lim.append(f"TigerGraph holds a documented subset of the dataset ({self.tg_subset}).")
        return lim

    def _error_response(self, p: Prepared, error: str) -> CheckResponse:
        """status=error, never charged; reports the unchanged balance."""
        self._log(p, "UNKNOWN", None, charged=False)
        return CheckResponse(
            status="error", address=p.address, verdict="UNKNOWN", risk_score=None, dataset_label=None,
            hops_to_nearest_illicit=None, tigergraph=TigerGraphInfo(query_name="none", ms=0),
            model=self._model_info(), explanation=Explanation(en="", hi=""),
            limitations=self._base_limitations(), error=error, engine=None,
            is_mock=self.data_source == "synthetic_fixture" or None,
            credits_remaining=self._balance(p.session_id))

    def _assemble(self, p: Prepared, exp: Exposure | None, lookup_ms: float
                  ) -> tuple[dict[str, Any], CheckResponse]:
        assert self.scorer is not None
        ofac, ransom = self.labels.hits(p.address)
        ransom = ransom and self.s.ransomwhere_enabled
        in_dataset = exp is not None and self.scorer.has(p.address)
        limitations = self._base_limitations()
        # not found: the engine only did an existence lookup; report that, timed around the call
        tg_info = TigerGraphInfo(query_name=f"{self.engine.name}.lookup", ms=round(lookup_ms, 2))
        hops: dict[int, Counts] = {}
        nodes: list[GraphNode] = []
        links: list[GraphLink] = []
        nearest: int | None = None
        pagerank: float | None = None
        comp_size: int | None = None
        truncated = False
        score_res = None
        if exp is not None:
            tg_info = TigerGraphInfo(query_name=exp.query_name, ms=round(exp.elapsed_ms, 2), gsql=exp.gsql)
            hops = {h: Counts(illicit=c.illicit, licit=c.licit, unknown=c.unknown) for h, c in exp.counts.items()}
            nodes = [GraphNode(id=n.id, label=n.label, hop=n.hop, is_subject=True if n.hop == 0 else None)
                     for n in exp.nodes]
            links = [GraphLink(source=a, target=b) for a, b in exp.links]
            nearest = exp.nearest_illicit
            pagerank, comp_size, truncated = exp.subject.pagerank, exp.subject.comp_size, exp.truncated
            if truncated:
                limitations.append(f"Neighbourhood expansion was capped at {self.s.max_frontier} wallets per hop "
                                   "(very connected wallet); counts are partial.")
        if in_dataset:
            score_res = self.scorer.score(p.address)
        else:
            limitations.append("Not in the research dataset: absence from the data is not evidence of safety.")
        score = score_res.score if score_res else None
        dataset_label = self.scorer.label(p.address) if in_dataset else None
        verdict = decide(score, in_dataset, ofac, self.scorer.warn, self.scorer.block, dataset_label)
        status: Literal["ok", "not_in_dataset"] = "ok" if in_dataset else "not_in_dataset"
        hop1 = hops.get(1, Counts())
        reasons = build_reasons(ReasonInput(
            ofac=ofac, ransomwhere=ransom, in_dataset=in_dataset, dataset_label=dataset_label,
            hop1_illicit=hop1.illicit, nearest_illicit=nearest, max_hop=self.s.max_hop, comp_size=comp_size,
            pagerank=pagerank, pagerank_p99=self.scorer.pagerank_p99, verdict=verdict,
            contributions=score_res.contributions if score_res else [], dataset_name=self.dataset_name))
        idx = 0 if p.lang == "en" else 1
        neighbors = Neighbors(hop1=hops.get(1, Counts()), hop2=hops.get(2, Counts()), hop3=hops.get(3))
        hash_evidence = {
            "address": p.address, "chain": "bitcoin",
            "dataset": "elliptic++" if self.data_source == "elliptic++" else self.data_source,
            "datasetLabel": dataset_label, "hopsToNearestIllicit": nearest,
            "labelHits": {"ofac": ofac, "ransomwhere": ransom}, "model": self._model_info().name,
            "neighbors": neighbors.model_dump(mode="json"),
            "pagerank": None if pagerank is None else f"{pagerank:.8f}", "componentSize": comp_size,
            "riskScore": score, "verdict": verdict,
        }
        resp = CheckResponse(
            is_mock=True if self.data_source == "synthetic_fixture" else None,
            status=status, address=p.address, verdict=verdict, risk_score=score, dataset_label=dataset_label,
            hops_to_nearest_illicit=nearest, neighbors=neighbors,
            graph_features=GraphFeatures(pagerank=pagerank, component_size=comp_size),
            label_hits=LabelHits(ofac=ofac, ransomwhere=ransom), top_reasons=[r[idx] for r in reasons],
            subgraph=Subgraph(nodes=nodes, links=links), tigergraph=tg_info, model=self._model_info(),
            explanation=Explanation(en="", hi=""), audio_url=None, limitations=limitations,
            report_hash=report_hash(hash_evidence), engine=self.engine.name,
            cached=False, replay=False, truncated=truncated,
        )
        explain_evidence = {**hash_evidence, "status": status, "maxHop": self.s.max_hop,
                            "datasetName": self.dataset_name,
                            "topReasons": [r[0] for r in reasons], "limitations": limitations}
        return explain_evidence, resp


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class _UnavailableEngine:
    """Stand-in when the configured engine cannot be built: every call fails, so the pipeline serves
    a replay (if available) or a 503, and /api/health reports engineOk=false."""

    def __init__(self, name: Literal["tigergraph", "networkx"], reason: str) -> None:
        self.name = name
        self.reason = reason

    def ping(self) -> bool:
        return False

    def get_wallet(self, address: str) -> None:
        raise GraphEngineError(self.reason)

    def khop_exposure(self, address: str, max_hop: int, max_nodes: int) -> Exposure | None:
        raise GraphEngineError(self.reason)

    def close(self) -> None:
        return None


def build_pipeline(settings: Settings, db: Database, explainer: Explainer | None = None,
                   http: httpx.AsyncClient | None = None) -> CheckPipeline:
    from app.services.explain.explainer import LLMExplainer
    from app.services.explain.llm import build_llm
    from app.services.explain.templates import TemplateExplainer
    from app.services.graph.factory import build_engine

    scorer: Scorer | None
    try:
        scorer = Scorer(settings.artifacts_dir, settings.processed_dir)
    except FileNotFoundError:
        log.warning("model_not_loaded", hint="run make data && make train")
        scorer = None
    engine: GraphEngine
    try:
        engine = build_engine(settings)
    except Exception as exc:  # missing data or credentials: keep serving replays/health
        log.error("graph_engine_unavailable", engine=settings.graph_engine, err=type(exc).__name__)
        engine = _UnavailableEngine(settings.graph_engine, f"{settings.graph_engine} not available")
    labels = LabelLists(settings.ofac_list_path,
                        settings.ransomwhere_path if settings.ransomwhere_enabled else None)
    if explainer is None:
        llm = build_llm(settings)
        explainer = LLMExplainer(llm) if llm is not None else TemplateExplainer()
    tts = TTS(settings, http) if http is not None else None
    pipeline = CheckPipeline(settings, db, engine, scorer, labels, explainer,
                             ReplayStore(settings.artifacts_dir / "replay"), tts)
    if http is not None and settings.dodo_api_key.get_secret_value() and settings.dodo_usage_meter_event:
        pipeline.usage_hook = _usage_reporter(settings, db, http)
    return pipeline


def _usage_reporter(settings: Settings, db: Database, http: httpx.AsyncClient) -> Callable[[str], Awaitable[None]]:
    from app.db.models import SessionRow
    from app.errors import UpstreamError
    from app.services.billing.dodo import DodoClient

    dodo = DodoClient(settings, http)

    async def report(session_id: str) -> None:
        with db.session() as s:
            row = s.get(SessionRow, session_id)
            customer = row.dodo_customer_id if row else None
        if not customer:
            return  # anonymous session that never paid via Dodo: nothing to meter
        try:
            await dodo.report_usage(customer, "use_" + secrets.token_hex(10))
        except UpstreamError as exc:
            log.warning("dodo_usage_failed", detail=exc.detail)

    return report
