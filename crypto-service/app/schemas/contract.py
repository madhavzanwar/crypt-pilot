"""Pydantic models that mirror docs/api-contract.md exactly (camelCase JSON on the wire).

Optional fields are serialised only when set (routers use response_model_exclude_none where the
contract marks a field optional), so the JSON matches the TypeScript interfaces.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Verdict = Literal["ALLOW", "WARN", "BLOCK", "UNKNOWN"]
NodeLabel = Literal["illicit", "licit", "unknown"]
Lang = Literal["en", "hi"]
Engine = Literal["tigergraph", "networkx", "replay"]
VoiceProvider = Literal["wispr", "sarvam", "browser"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class Counts(CamelModel):
    illicit: int = 0
    licit: int = 0
    unknown: int = 0


class GraphNode(CamelModel):
    id: str
    label: NodeLabel
    hop: int
    is_subject: bool | None = None
    risk_score: float | None = None


class GraphLink(CamelModel):
    source: str
    target: str
    amount_btc: float | None = None


class Neighbors(CamelModel):
    hop1: Counts = Field(default_factory=Counts)
    hop2: Counts = Field(default_factory=Counts)
    hop3: Counts | None = None


class GraphFeatures(CamelModel):
    pagerank: float | None = None
    component_size: int | None = None


class LabelHits(CamelModel):
    ofac: bool = False
    ransomwhere: bool = False


class Subgraph(CamelModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    links: list[GraphLink] = Field(default_factory=list)


class TigerGraphInfo(CamelModel):
    query_name: str
    ms: float
    gsql: str | None = None


class ModelInfo(CamelModel):
    name: str
    illicit_f1_test: float | None = None


class Explanation(CamelModel):
    en: str
    hi: str


class CheckResponse(CamelModel):
    is_mock: bool | None = None
    status: Literal["ok", "not_in_dataset", "error"]
    address: str
    chain: Literal["bitcoin"] = "bitcoin"
    verdict: Verdict
    risk_score: int | None
    dataset_label: NodeLabel | None
    hops_to_nearest_illicit: int | None
    neighbors: Neighbors = Field(default_factory=Neighbors)
    graph_features: GraphFeatures = Field(default_factory=GraphFeatures)
    label_hits: LabelHits = Field(default_factory=LabelHits)
    top_reasons: list[str] = Field(default_factory=list)
    subgraph: Subgraph = Field(default_factory=Subgraph)
    tigergraph: TigerGraphInfo
    model: ModelInfo
    explanation: Explanation
    audio_url: str | None = None
    limitations: list[str] = Field(default_factory=list)
    report_hash: str | None = None
    credits_remaining: int | None = None
    error: str | None = None
    # additive (see docs/api-contract.md "Backend additions")
    cached: bool | None = None
    engine: Engine | None = None
    replay: bool | None = None
    truncated: bool | None = None


class CheckRequest(CamelModel):
    address: str = Field(min_length=1, max_length=512)
    lang: Lang = "en"


class ErrorResponse(CamelModel):
    error: str


class TranscribeResponse(CamelModel):
    text: str
    address: str | None
    provider: VoiceProvider


class PackOut(CamelModel):
    id: str
    credits: int
    price_usd: float
    label: str


class CreditsResponse(CamelModel):
    balance: int
    packs: list[PackOut]


class CheckoutRequest(CamelModel):
    pack_id: str


class CheckoutResponse(CamelModel):
    url: str


class CryptoInvoiceRequest(CamelModel):
    pack_id: str
    coin: Literal["btc", "xmr"]


class CryptoInvoiceResponse(CamelModel):
    invoice_id: str
    uri: str
    address: str
    amount: str
    coin: Literal["btc", "xmr"]
    expires_at: str
    provider: Literal["explorer", "demo"] | None = None


class CryptoInvoiceStatus(CamelModel):
    status: Literal["waiting", "paid", "expired"]


class DemoWallet(CamelModel):
    address: str
    note: str
    expected: Verdict


class DemoWalletsResponse(CamelModel):
    wallets: list[DemoWallet]


class BenchmarkRow(CamelModel):
    method: Literal["raw_dump", "graph_evidence"]
    input_tokens: float
    latency_ms: float
    accuracy_pct: float


class BenchmarkModelRow(CamelModel):
    name: Literal["baseline", "with_graph_features"]
    illicit_f1: float
    precision: float
    recall: float
    # additive: threshold-free PR-AUC on the same test split. F1/precision/recall are at the WARN threshold
    # (predicted illicit = WARN or BLOCK); a model can rank better (PR-AUC) yet score a lower F1 at that threshold.
    pr_auc: float | None = None


class BenchmarkResponse(CamelModel):
    status: Literal["not_measured", "ok"]
    measured_at: str | None = None
    sample_size: int | None = None
    rows: list[BenchmarkRow] | None = None
    models: list[BenchmarkModelRow] | None = None


class BenchmarkRunRequest(CamelModel):
    sample_size: int = Field(default=25, ge=2)


class BenchmarkRunResponse(CamelModel):
    job_id: str


class BenchmarkJobStatus(CamelModel):
    status: Literal["running", "done", "failed"]
    progress: float
    error: str | None = None


class HealthResponse(CamelModel):
    ok: bool
    voice_provider: VoiceProvider
    mocks: bool | None = None
    # additive diagnostics
    engine: str | None = None
    engine_ok: bool | None = None
    model_loaded: bool | None = None
    llm_configured: bool | None = None
    ofac_loaded: bool | None = None
    data_source: str | None = None


def to_wire(m: BaseModel) -> dict[str, Any]:
    """camelCase JSON that keeps required-but-null fields (e.g. riskScore: null) and omits unset
    optional ones (e.g. no `cached` key), matching the TypeScript interfaces exactly."""
    out: dict[str, Any] = {}
    for name, field in type(m).model_fields.items():
        v = getattr(m, name)
        if v is None and not field.is_required():
            continue
        out[field.alias or name] = _wire_value(v)
    return out


def _wire_value(v: Any) -> Any:
    if isinstance(v, BaseModel):
        return to_wire(v)
    if isinstance(v, list):
        return [_wire_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _wire_value(x) for k, x in v.items()}
    return v
