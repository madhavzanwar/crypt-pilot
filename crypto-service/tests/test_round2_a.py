"""Round-2 regression tests (agent A): one section per bug id."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from app.db.models import CreditLedger, SessionRow, UnmatchedPayment, WebhookEvent
from tests.test_payments import SW_SECRET, client_with, signed_post


def _sid(c: TestClient) -> str:
    c.get("/api/credits")
    return c.cookies.get("cryptiq_sid").rsplit(".", 1)[0]  # type: ignore[union-attr]


def _paid(sid: str | None, pack: str | None = "starter", pay: str | None = "pay_x", **data: Any) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    if sid is not None:
        meta["session_id"] = sid
    if pack is not None:
        meta["pack_id"] = pack
    d: dict[str, Any] = {"metadata": meta, **data}
    if pay is not None:
        d["payment_id"] = pay
    return {"type": "payment.succeeded", "data": d}


# ------------------------------------------------------------------------------------------------ BUG-005


def test_bug005_unknown_pack_is_retryable_persisted_and_not_processed(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    r = signed_post(c, "evt_u1", _paid(sid, pack="enterprise", pay="pay_u1"))
    assert r.status_code == 503 and r.json() == {"error": "unmatched_payment"}
    assert c.get("/api/credits").json()["balance"] == 3  # nothing credited
    with c.app.state.cryptiq.db.session() as s:
        assert s.get(WebhookEvent, "evt_u1") is None  # NOT marked processed: Dodo's retry must be re-evaluated
        row = s.get(UnmatchedPayment, "evt_u1")
        assert row is not None and row.reason == "unknown_pack" and row.payment_id == "pay_u1"
        assert row.session_id == sid and row.pack_id == "enterprise"
    # redelivery bumps attempts instead of failing or duplicating
    assert signed_post(c, "evt_u1", _paid(sid, pack="enterprise", pay="pay_u1")).status_code == 503
    with c.app.state.cryptiq.db.session() as s:
        assert s.get(UnmatchedPayment, "evt_u1").attempts == 2  # type: ignore[union-attr]
    # once the pack is resolvable the same event id is credited normally
    assert signed_post(c, "evt_u1", _paid(sid, pack="starter", pay="pay_u1")).json() == {"ok": True}
    assert c.get("/api/credits").json()["balance"] == 8


def test_bug005_unknown_session_creates_no_ghost_session(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    r = signed_post(c, "evt_g1", _paid("ghost-session-id", pay="pay_g1"))
    assert r.status_code == 503
    with c.app.state.cryptiq.db.session() as s:
        assert s.get(SessionRow, "ghost-session-id") is None
        assert s.query(CreditLedger).filter(CreditLedger.session_id == "ghost-session-id").count() == 0
        assert s.get(UnmatchedPayment, "evt_g1").reason == "unknown_session"  # type: ignore[union-attr]
        assert s.get(WebhookEvent, "evt_g1") is None


def test_bug005_missing_fields_and_product_or_amount_mismatch(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    cases = {
        "e_nopay": (_paid(sid, pay=None), "no_payment_id"),
        "e_nosid": (_paid(None), "no_session"),
        "e_prod": (_paid(sid, pay="p2", product_cart=[{"product_id": "pdt_other", "quantity": 1}]), "product_mismatch"),
        "e_amt": (_paid(sid, pay="p3", total_amount=10, currency="USD"), "amount_mismatch"),
    }
    for eid, (ev, reason) in cases.items():
        assert signed_post(c, eid, ev).status_code == 503, eid
        with c.app.state.cryptiq.db.session() as s:
            assert s.get(UnmatchedPayment, eid).reason == reason  # type: ignore[union-attr]
    assert c.get("/api/credits").json()["balance"] == 3
    # a payload that matches the configured product and price is credited
    ok = _paid(sid, pay="p4", product_cart=[{"product_id": "pdt_test", "quantity": 1}], total_amount=100, currency="USD")
    assert signed_post(c, "e_ok", ok).json() == {"ok": True}
    assert c.get("/api/credits").json()["balance"] == 8


def test_bug005_add_credits_refuses_to_create_sessions(settings: Any) -> None:
    from app.services.billing import ledger

    c = client_with(settings)
    with c.app.state.cryptiq.db.session() as s:
        assert ledger.add_credits(s, "nobody", 5, "dodo", "pay_zz") is False
        assert s.get(SessionRow, "nobody") is None


# ------------------------------------------------------------------------------------------------ BUG-085


def test_bug085_odd_signed_bodies_never_500(settings: Any) -> None:
    import json

    from app.services.billing.webhook_verify import sign

    c = client_with(settings, dodo_webhook_secret=SW_SECRET)

    def post(eid: str, raw: bytes) -> Any:
        ts = int(time.time())
        return c.post("/api/webhooks/dodo", content=raw, headers={
            "webhook-id": eid, "webhook-timestamp": str(ts), "webhook-signature": sign(SW_SECRET, eid, ts, raw)})

    assert post("b1", b"[]").status_code == 400
    assert post("b2", b'{"data":"x","type":"payment.succeeded"}').status_code == 503  # unmatched, not 500
    assert post("b3", json.dumps({"type": "payment.succeeded", "data": {"metadata": "str"}}).encode()).status_code == 503
    assert post("b4", json.dumps({"type": "x", "data": []}).encode()).json() == {"ok": True}
    r = post("i" * 300, b"{}")  # longer than webhook_events.id (String(128)): rejected, not stored
    assert r.status_code == 400 and r.json() == {"error": "invalid_webhook_id"}


# ------------------------------------------------------------------------------------------------ BUG-090


def test_bug090_refund_and_lost_dispute_revoke_credits_once(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    assert signed_post(c, "r_pay", _paid(sid, pay="pay_r")).json() == {"ok": True}
    assert c.get("/api/credits").json()["balance"] == 8
    refund = {"type": "refund.succeeded", "data": {"payment_id": "pay_r"}}
    assert signed_post(c, "r_ref", refund).json() == {"ok": True}
    assert c.get("/api/credits").json()["balance"] == 3
    # a second event type for the same payment must not revoke twice
    assert signed_post(c, "r_disp", {"type": "dispute.lost", "data": {"payment_id": "pay_r"}}).status_code == 200
    assert c.get("/api/credits").json()["balance"] == 3
    # refund for an unknown payment is a no-op
    assert signed_post(c, "r_none", {"type": "payment.refunded", "data": {"payment_id": "nope"}}).status_code == 200
    assert c.get("/api/credits").json()["balance"] == 3


# ------------------------------------------------------------------------------------------------ BUG-013


def test_bug013_image_defaults_to_prod_and_prod_refuses_placeholder_secrets() -> None:
    import re
    from pathlib import Path

    import pytest

    from app.config import Settings
    from app.main import check_production_settings

    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text()
    assert re.search(r"^ENV\s+APP_ENV=prod\b", dockerfile, re.M), "image must default to APP_ENV=prod"
    # what the image does when started with no other env: default secrets are the public placeholders
    placeholder = Settings(_env_file=None, app_env="prod", cors_origins="https://x.test")  # type: ignore[call-arg]
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        check_production_settings(placeholder)


# ------------------------------------------------------------------------------------------------ pipeline fixtures

from tests.test_api_check import demo, make_client  # noqa: E402,F401  (pytest fixtures)


def _chk(c: TestClient, addr: str, lang: str = "en") -> Any:
    return c.post("/api/check", json={"address": addr, "lang": lang})


# ------------------------------------------------------------------------------------------------ BUG-006 (server half)


def test_bug006_language_switch_is_not_a_second_paid_check(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=3)
    a = _chk(c, demo["BLOCK"], "en").json()
    assert a["creditsRemaining"] == 2 and a["cached"] is False
    b = _chk(c, demo["BLOCK"], "hi").json()
    assert b["creditsRemaining"] == 2, "switching the UI language must not spend another credit"
    assert b["verdict"] == a["verdict"] and b["explanation"] == a["explanation"]
    # the Hindi result is cached too; both languages are now free
    assert _chk(c, demo["BLOCK"], "hi").json()["cached"] is True
    assert _chk(c, demo["BLOCK"], "en").json()["cached"] is True
    assert c.get("/api/credits").json()["balance"] == 2


def test_bug006_run1_double_effect_charges_once(tmp_path: Any, trained: Any, demo: dict[str, str]) -> None:
    """`?address=..&run=1` auto-run fires twice (StrictMode / lang change): concurrent requests charge once."""
    import asyncio

    import httpx

    from app.main import build_state, create_app
    from tests.test_api_check import make_settings

    s = make_settings(tmp_path, trained, starting_credits=3)
    app = create_app(s, build_state(s))

    async def run() -> tuple[list[int], int]:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            await c.get("/api/credits")
            rs = await asyncio.gather(*[c.post("/api/check", json={"address": demo["BLOCK"], "lang": lang})
                                        for lang in ("en", "hi", "en", "hi")])
            bal = (await c.get("/api/credits")).json()["balance"]
            return sorted(r.status_code for r in rs), bal

    codes, bal = asyncio.run(run())
    assert codes == [200] * 4 and bal == 2


# ------------------------------------------------------------------------------------------------ BUG-048


def test_bug048_replay_fallback_is_cached_and_charged_once(make_client: Any, demo: dict[str, str],
                                                           trained: Any, tmp_path: Any) -> None:
    from app.services.graph.base import GraphEngineError
    from app.services.graph.replay import ReplayStore

    c = make_client(artifacts_dir=trained[1], starting_credits=3)
    p = c.app.state.cryptiq.pipeline
    real = _chk(c, demo["BLOCK"]).json()
    store = ReplayStore(tmp_path / "replay")
    store.put(demo["BLOCK"], "en", "2026-10-28T00:00:00+00:00", {k: v for k, v in real.items() if k != "creditsRemaining"})
    p.replay = store
    p.cache = type(p.cache)(600)

    def boom(*_: Any) -> None:
        raise GraphEngineError("down")

    p.engine.khop_exposure = boom
    first = _chk(c, demo["BLOCK"]).json()
    assert first["engine"] == "replay" and first["creditsRemaining"] == 1
    for _ in range(2):
        again = _chk(c, demo["BLOCK"]).json()
        assert again["cached"] is True and again["creditsRemaining"] == 1
    assert c.get("/api/credits").json()["balance"] == 1


# ------------------------------------------------------------------------------------------------ BUG-087


def test_bug087_zero_credits_still_serves_cached_and_unknown(make_client: Any, demo: dict[str, str]) -> None:
    c = make_client(starting_credits=1)
    assert _chk(c, demo["BLOCK"]).status_code == 200  # spends the only credit
    assert _chk(c, demo["WARN"]).status_code == 402   # an uncached, chargeable wallet still needs a credit
    cached = _chk(c, demo["BLOCK"])
    assert cached.status_code == 200 and cached.json()["cached"] is True and cached.json()["creditsRemaining"] == 0
    other_lang = _chk(c, demo["BLOCK"], "hi")
    assert other_lang.status_code == 200 and other_lang.json()["creditsRemaining"] == 0
    unknown = _chk(c, demo["UNKNOWN"])
    assert unknown.status_code == 200 and unknown.json()["status"] == "not_in_dataset"
    stream = c.post("/api/check/stream", json={"address": demo["WARN"], "lang": "en"})
    assert stream.status_code == 402


# ------------------------------------------------------------------------------------------------ BUG-089


def test_bug089_lost_credit_race_is_not_cached(make_client: Any, demo: dict[str, str]) -> None:
    from app.services.billing import ledger

    c = make_client(starting_credits=1)
    p = c.app.state.cryptiq.pipeline
    real_try_charge = ledger.try_charge

    def lose(*_a: Any, **_k: Any) -> None:  # another request spent the last credit while this one ran
        return None

    ledger.try_charge = lose  # type: ignore[assignment]
    try:
        r = _chk(c, demo["BLOCK"])
    finally:
        ledger.try_charge = real_try_charge  # type: ignore[assignment]
    assert r.status_code == 402
    assert p.cache.get(demo["BLOCK"]) is None, "the loser's result must not be served to others for free"
    ok = _chk(c, demo["BLOCK"])
    assert ok.status_code == 200 and ok.json()["cached"] is False and ok.json()["creditsRemaining"] == 0
