"""Regression tests for findings of the adversarial review of integration/wire-up."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.models import BenchmarkJob, Invoice
from app.main import _fail_stale_benchmark_jobs, build_state, check_production_settings, create_app
from app.services.address import looks_like_secret
from app.services.billing.webhook_verify import WebhookVerificationError, verify
from app.services.explain.explainer import LLMExplainer
from app.services.explain.llm import LLMResult
from app.services.labels.lists import LabelLists
from app.services.model.policy import decide
from tests.test_api_check import make_settings
from tests.test_payments import PACKS, SW_SECRET, TB_ADDR


def demo_wallets(trained: tuple[Path, Path]) -> dict[str, str]:
    w = json.loads((trained[1] / "demo_wallets.json").read_text())["wallets"]
    return {x["expected"]: x["address"] for x in w}


async def test_concurrent_identical_checks_charge_once(tmp_path: Path, trained: tuple[Path, Path]) -> None:
    """Review #1: three concurrent identical checks used to charge three times."""
    s = make_settings(tmp_path, trained, starting_credits=3)
    app = create_app(s, build_state(s))
    addr = demo_wallets(trained)["BLOCK"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        await c.get("/api/health")
        rs = await asyncio.gather(*[c.post("/api/check", json={"address": addr, "lang": "en"}) for _ in range(3)])
    assert sorted(r.status_code for r in rs) == [200, 200, 200]
    assert sorted(bool(r.json().get("cached")) for r in rs) == [False, True, True]
    assert min(r.json()["creditsRemaining"] for r in rs) == 2  # exactly one credit spent


def test_inflight_table_is_cleaned_up(tmp_path: Path, trained: tuple[Path, Path]) -> None:
    s = make_settings(tmp_path, trained)
    st = build_state(s)
    with TestClient(create_app(s, st)) as c:
        c.post("/api/check", json={"address": demo_wallets(trained)["ALLOW"], "lang": "en"})
        assert st.pipeline is not None and st.pipeline._inflight == {}


@pytest.mark.parametrize(("score", "label", "expected"), [
    (3, "illicit", "WARN"), (3, "licit", "ALLOW"), (3, "unknown", "ALLOW"), (80, "illicit", "BLOCK"),
])
def test_dataset_illicit_is_never_allow(score: int, label: str, expected: str) -> None:
    assert decide(score, True, False, warn=35, block=70, dataset_label=label) == expected


@pytest.mark.parametrize("text", [
    "abandon​ abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "1. abandon 2. abandon 3. abandon 4. abandon 5. abandon 6. abandon 7. abandon 8. abandon 9. abandon "
    "10. abandon 11. abandon 12. about",
    "ａｂａｎｄｏｎ " * 11 + "about",  # full-width letters
])
def test_secret_guard_unicode_and_numbering_bypass(text: str) -> None:
    assert looks_like_secret(text)


def test_webhook_unicode_digit_timestamp_is_a_clean_rejection() -> None:
    headers = {"webhook-id": "m", "webhook-timestamp": "²", "webhook-signature": "v1,AAAA"}
    with pytest.raises(WebhookVerificationError):
        verify(SW_SECRET, headers, b"{}")


def test_admin_token_non_ascii_is_403_not_500(settings: Settings) -> None:
    s = Settings(_env_file=None, **{**settings.model_dump(), "xmr_demo_address": "4DEMO", "packs_json": PACKS})
    with TestClient(create_app(s, build_state(s)), raise_server_exceptions=False) as c:
        inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "xmr"}).json()
        url = f"/api/admin/crypto-invoice/{inv['invoiceId']}/mark-paid"
        r = c.post(url, headers={"x-admin-token": "caf\u00e9".encode("latin-1")})
    assert r.status_code == 403


def test_empty_ransomwhere_file_does_not_crash(tmp_path: Path) -> None:
    empty = tmp_path / "rw.csv"
    empty.write_text("")
    assert LabelLists(tmp_path / "missing.txt", empty).hits("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa") == (False, False)


def test_missing_ofac_list_is_visible_and_blocks_prod(settings: Settings, tmp_path: Path) -> None:
    with TestClient(create_app(settings, build_state(settings))) as c:
        assert c.get("/api/health").json()["ofacLoaded"] is False  # fixture settings point at a missing file
    prod = Settings(_env_file=None, app_env="prod", session_secret="s3cret-v", log_salt="salt-v",
                    cors_origins="https://app.example", ofac_list_path=tmp_path / "nope.txt")
    with pytest.raises(RuntimeError, match="OFAC"):
        check_production_settings(prod)


class SlowLLM:
    provider, model = "slow", "slow-1"

    async def complete(self, *a: Any, **k: Any) -> LLMResult:
        await asyncio.sleep(5)
        raise AssertionError("deadline should have cancelled this")

    async def aclose(self) -> None:
        return None


async def test_llm_overall_deadline_falls_back_to_template() -> None:
    from app.services.explain.templates import template_en
    from tests.test_explain import ev

    start = time.perf_counter()
    en, _ = await LLMExplainer(SlowLLM(), deadline_s=0.2).explain(ev())  # type: ignore[arg-type]
    assert time.perf_counter() - start < 2 and en == template_en(ev())


def _crypto_client(settings: Settings, txs: list[dict[str, Any]]) -> TestClient:
    def explorer(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/blocks/tip/height"):
            return httpx.Response(200, text="1000")
        return httpx.Response(200, json=txs)

    s = Settings(_env_file=None, **{**settings.model_dump(), "packs_json": PACKS, "btc_receive_address": TB_ADDR,
                                    "btc_sats_per_usd": 1000, "btc_explorer_base_url": "https://x.test/api"})
    st = build_state(s)
    st.http = httpx.AsyncClient(transport=httpx.MockTransport(explorer))
    c = TestClient(create_app(s, st))
    c.__enter__()
    return c


def _tx(sats: int) -> dict[str, Any]:
    return {"txid": "cd" * 32, "status": {"confirmed": True, "block_height": 1000, "block_time": int(time.time())},
            "vout": [{"scriptpubkey_address": TB_ADDR, "value": sats}]}


def test_same_tx_cannot_pay_two_invoices_and_polls_never_500(settings: Settings) -> None:
    txs: list[dict[str, Any]] = []
    c = _crypto_client(settings, txs)
    a = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json()["invoiceId"]
    with c.app.state.cryptiq.db.session() as db:
        sats = db.get(Invoice, a).amount_atomic
    txs.append(_tx(sats))
    assert c.get(f"/api/crypto-invoice/{a}").json() == {"status": "paid"}
    # a second invoice with the identical amount (forced) must not match the already-used tx
    b = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json()["invoiceId"]
    with c.app.state.cryptiq.db.session() as db:
        row = db.get(Invoice, b)
        row.amount_atomic, row.last_polled_at = sats, None
    r = c.get(f"/api/crypto-invoice/{b}")
    assert r.status_code == 200 and r.json() == {"status": "waiting"}
    assert c.get("/api/credits").json()["balance"] == 3 + 5  # credited once


def test_open_invoice_cap_per_session(settings: Settings) -> None:
    c = _crypto_client(settings, [])
    codes = [c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).status_code for _ in range(7)]
    assert codes.count(200) == 5 and codes[-1] == 429


def test_benchmark_needs_admin_token_in_prod_and_stale_jobs_reset(settings: Settings) -> None:
    s = Settings(_env_file=None, **{**settings.model_dump(), "app_env": "prod", "session_secret": "s3cret-v",
                                    "log_salt": "salt-v", "admin_token": "tok-123456", "ofac_list_path": __file__})
    st = build_state(s)
    with TestClient(create_app(s, st)) as c:
        assert c.post("/api/benchmark/run", json={"sampleSize": 4}).status_code == 403
        assert c.post("/api/benchmark/run", json={"sampleSize": 4}, headers={"x-admin-token": "wrong"}).status_code == 403
        # with the right token it passes the gate (then fails later for other reasons, not 403)
        r = c.post("/api/benchmark/run", json={"sampleSize": 4}, headers={"x-admin-token": "tok-123456"})
        assert r.status_code != 403
    with st.db.session() as db:
        db.add(BenchmarkJob(id="stuck", status="running", progress=0.2, sample_size=4))
    _fail_stale_benchmark_jobs(st.db)
    with st.db.session() as db:
        job = db.get(BenchmarkJob, "stuck")
        assert job is not None and (job.status, job.error) == ("failed", "server_restarted")


def test_benchmark_row_without_reported_tokens_is_left_out(settings: Settings, tmp_path: Path) -> None:
    art = tmp_path / "art"
    art.mkdir()
    (art / "benchmark_results.json").write_text(json.dumps({
        "dataSource": "elliptic++", "measuredAt": "2026-10-28T00:00:00+00:00", "sampleSize": 4,
        "rows": [{"method": "raw_dump", "inputTokens": None, "latencyMs": 10.0, "accuracyPct": 50.0},
                 {"method": "graph_evidence", "inputTokens": 120.5, "latencyMs": 8.0, "accuracyPct": 75.0}]}))
    s = Settings(_env_file=None, **{**settings.model_dump(), "artifacts_dir": art})
    with TestClient(create_app(s, build_state(s))) as c:
        rows = c.get("/api/benchmark").json()["rows"]
    assert [r["method"] for r in rows] == ["graph_evidence"]


def test_demo_wallets_from_another_dataset_are_not_served(settings: Settings, trained: tuple[Path, Path],
                                                          tmp_path: Path) -> None:
    import shutil

    art = tmp_path / "art"
    shutil.copytree(trained[1], art)
    d = json.loads((art / "demo_wallets.json").read_text())
    d["dataSource"] = "elliptic++"  # exported from real data, but the loaded model is the synthetic one
    (art / "demo_wallets.json").write_text(json.dumps(d))
    s = make_settings(tmp_path, trained, artifacts_dir=art)
    st = build_state(s)
    with TestClient(create_app(s, st)) as c:
        assert c.get("/api/demo-wallets").json() == {"wallets": []}
