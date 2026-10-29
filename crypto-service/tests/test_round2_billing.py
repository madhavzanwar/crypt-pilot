"""Round 2 (BUG-005, 085, 090): unmatched payments, webhook edge cases, refund/dispute recording."""

from __future__ import annotations

from typing import Any

import pytest

from app.db.models import CreditLedger, PaymentIssue, SessionRow, WebhookEvent
from app.services.billing import ledger
from tests.test_payments import SW_SECRET, client_with, signed_post


def _sid(c: Any) -> str:
    c.get("/api/credits")
    return c.cookies.get("cryptiq_sid").rsplit(".", 1)[0]


def _pay(sid: str | None, pack: str = "starter", pid: str = "pay_1", **data: Any) -> dict[str, Any]:
    meta = {"pack_id": pack, **({"session_id": sid} if sid else {})}
    return {"type": "payment.succeeded", "data": {"payment_id": pid, "metadata": meta, **data}}


def _issues(c: Any) -> list[PaymentIssue]:
    with c.app.state.cryptiq.db.session() as s:
        rows = s.query(PaymentIssue).all()
        s.expunge_all()
        return rows


@pytest.mark.parametrize("event,reason", [
    (lambda sid: _pay(sid, pack="enterprise"), "unknown_pack"),
    (lambda sid: _pay("ghost-session"), "unknown_session"),
    (lambda sid: _pay(None), "no_session"),
    (lambda sid: _pay(sid, product_cart=[{"product_id": "pdt_other", "quantity": 1}]), "product_mismatch"),
    (lambda sid: _pay(sid, total_amount=50, currency="USD"), "amount_too_low"),
])
def test_unmatched_payment_is_recorded_retried_and_never_processed(settings: Any, event: Any, reason: str) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    r = signed_post(c, "evt_u", event(sid))
    assert r.status_code == 500 and r.json() == {"error": "unmatched_payment"}  # non-2xx: Dodo retries
    rows = _issues(c)
    assert [(i.kind, i.reason, i.event_id) for i in rows] == [("unmatched_payment", reason, "evt_u")]
    with c.app.state.cryptiq.db.session() as s:
        assert s.get(WebhookEvent, "evt_u") is None  # not marked processed
        assert s.query(SessionRow).count() == 1  # no ghost session
        assert ledger.balance(s, sid) == 3
    assert signed_post(c, "evt_u", event(sid)).status_code == 500  # retry: still not acknowledged
    assert _issues(c)[0].attempts == 2


def test_retry_succeeds_once_the_session_exists(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    assert signed_post(c, "evt_late", _pay("late-sid", pid="pay_late")).status_code == 500
    with c.app.state.cryptiq.db.session() as s:
        s.add(SessionRow(id="late-sid"))
    assert signed_post(c, "evt_late", _pay("late-sid", pid="pay_late")).json() == {"ok": True}
    with c.app.state.cryptiq.db.session() as s:
        assert ledger.balance(s, "late-sid") == 5


def test_matching_product_and_amount_with_tax_credits(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    ev = _pay(sid, product_cart=[{"product_id": "pdt_test", "quantity": 1}], total_amount=118, currency="USD")
    assert signed_post(c, "evt_ok", ev).json() == {"ok": True}
    assert c.get("/api/credits").json()["balance"] == 8


def test_add_credits_refuses_unknown_session(settings: Any) -> None:
    c = client_with(settings)
    with c.app.state.cryptiq.db.session() as s:
        with pytest.raises(ledger.UnknownSessionError):
            ledger.add_credits(s, "nobody", 5, "admin", "r1")
    with c.app.state.cryptiq.db.session() as s:
        assert s.get(SessionRow, "nobody") is None
        assert s.query(CreditLedger).count() == 0


@pytest.mark.parametrize("raw", [b"[]", b'"x"', b"null", b"{bad"])
def test_webhook_non_object_body_is_400_not_500(settings: Any, raw: bytes) -> None:
    import time

    from app.services.billing.webhook_verify import sign
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    ts = int(time.time())
    r = c.post("/api/webhooks/dodo", content=raw, headers={
        "webhook-id": "e1", "webhook-timestamp": str(ts), "webhook-signature": sign(SW_SECRET, "e1", ts, raw)})
    assert r.status_code == 400


@pytest.mark.parametrize("data", ["x", None, 5, {"metadata": "str"}, {"metadata": [1], "customer": 3}])
def test_webhook_odd_data_shapes_never_500(settings: Any, data: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    r = signed_post(c, "e_odd", {"type": "payment.succeeded", "data": data})
    assert r.status_code == 500 and r.json() == {"error": "unmatched_payment"}  # handled, recorded, retried
    r = signed_post(c, "e_odd2", {"type": ["x"], "data": data})
    assert r.status_code == 200


def test_webhook_id_longer_than_128_rejected(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    assert signed_post(c, "e" * 300, {"type": "x"}).status_code == 400


def test_refund_and_dispute_are_recorded_not_ignored(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    sid = _sid(c)
    assert signed_post(c, "evt_p", _pay(sid, pid="pay_r")).json() == {"ok": True}
    assert signed_post(c, "evt_r", {"type": "refund.succeeded", "data": {"payment_id": "pay_r"}}).json() == {"ok": True}
    assert signed_post(c, "evt_d", {"type": "dispute.opened", "data": {"payment_id": "pay_r"}}).json() == {"ok": True}
    got = {(i.kind, i.payment_id, i.session_id, i.reason) for i in _issues(c)}
    assert got == {("refund", "pay_r", sid, "needs_manual_review"), ("dispute", "pay_r", sid, "needs_manual_review")}
    assert c.get("/api/credits").json()["balance"] == 8  # not auto-revoked (documented)
