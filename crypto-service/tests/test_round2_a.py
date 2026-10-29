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
