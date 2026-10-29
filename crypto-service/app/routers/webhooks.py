from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CreditLedger, PaymentIssue, SessionRow, WebhookEvent
from app.deps import get_state
from app.logging_setup import log
from app.services.billing import ledger
from app.services.billing.dodo import pack_mismatch, payment_fields
from app.services.billing.webhook_verify import WebhookVerificationError, verify
from app.state import AppState

router = APIRouter()

MAX_ID_LEN = 128  # webhook_events.id / credit_ledger.ref are String(128); longer would fail on Postgres
REFUND_TYPES = frozenset({"payment.refunded", "refund.succeeded"})


def _is_dispute(etype: str) -> bool:
    return etype.startswith("dispute.")


def _record_issue(s: Session, kind: str, event_id: str, etype: str, payment_id: str | None,
                  session_id: str | None, reason: str) -> None:
    row = s.query(PaymentIssue).filter(PaymentIssue.kind == kind, PaymentIssue.event_id == event_id).first()
    if row is not None:
        row.attempts += 1
        row.reason = reason
        return
    s.add(PaymentIssue(kind=kind, event_id=event_id, event_type=etype[:64],
                       payment_id=payment_id[:MAX_ID_LEN] if payment_id else None,
                       session_id=session_id[:MAX_ID_LEN] if session_id else None, reason=reason[:64]))


def _credit_payment(s: Session, state: AppState, event: dict[str, Any], event_id: str, etype: str) -> str | None:
    """Credit a payment.succeeded. Returns None on success, else the reason it could not be matched
    (the unmatched payment is recorded for reconciliation)."""
    payment_id, session_id, pack_id, customer_id = payment_fields(event)
    reason: str | None = None
    pack = state.settings.pack(pack_id or "")
    if not payment_id or len(payment_id) > MAX_ID_LEN:
        reason = "no_payment_id"
    elif not session_id or len(session_id) > MAX_ID_LEN:
        reason = "no_session"
    elif pack is None:
        reason = "unknown_pack"
    elif s.get(SessionRow, session_id) is None:
        reason = "unknown_session"
    else:
        reason = pack_mismatch(event, pack)
    if reason is not None or pack is None or payment_id is None or session_id is None:
        _record_issue(s, "unmatched_payment", event_id, etype, payment_id, session_id, reason or "unmatched")
        log.error("dodo_payment_unmatched", reason=reason, has_session=bool(session_id), has_pack=pack is not None)
        return reason or "unmatched"
    ledger.add_credits(s, session_id, pack.credits, "dodo", payment_id)
    row = s.get(SessionRow, session_id)
    if row is not None and customer_id:
        row.dodo_customer_id = customer_id[:64]
    log.info("dodo_payment_credited", credits=pack.credits)
    return None


def _record_reversal(s: Session, event: dict[str, Any], event_id: str, etype: str) -> None:
    """Refund/dispute: record it for a human. Credits are NOT revoked automatically (partial refunds, disputes
    that resolve in our favour and already-spent credits make an automatic clawback unsafe)."""
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    pid = data.get("payment_id")
    payment_id = pid if isinstance(pid, str) and pid else None
    session_id = None
    if payment_id:
        session_id = s.scalar(select(CreditLedger.session_id).where(
            CreditLedger.reason == "dodo", CreditLedger.ref == payment_id))
    kind = "dispute" if _is_dispute(etype) else "refund"
    _record_issue(s, kind, event_id, etype, payment_id, session_id, "needs_manual_review")
    log.warning("dodo_reversal_recorded", kind=kind, event_type=etype[:64], has_session=session_id is not None)


@router.post("/api/webhooks/dodo", include_in_schema=False)
async def dodo_webhook(request: Request, state: AppState = Depends(get_state)) -> JSONResponse:
    body = await request.body()
    try:
        event_id = verify(state.settings.dodo_webhook_secret.get_secret_value(), request.headers, body)
    except WebhookVerificationError as exc:
        log.warning("dodo_webhook_rejected", reason=str(exc))
        return JSONResponse(status_code=401, content={"error": "invalid_signature"})
    if len(event_id) > MAX_ID_LEN:
        return JSONResponse(status_code=400, content={"error": "invalid_webhook_id"})
    try:
        event = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        return JSONResponse(status_code=400, content={"error": "invalid_json"})
    if not isinstance(event, dict):
        return JSONResponse(status_code=400, content={"error": "invalid_json"})
    raw_type = event.get("type")
    etype = raw_type if isinstance(raw_type, str) else ""
    unmatched: str | None = None
    with state.db.session() as s:
        if s.get(WebhookEvent, event_id) is not None:
            return JSONResponse({"ok": True, "duplicate": True})
        if etype == "payment.succeeded":
            unmatched = _credit_payment(s, state, event, event_id, etype)
        elif etype in REFUND_TYPES or _is_dispute(etype):
            _record_reversal(s, event, event_id, etype)
        if unmatched is None:  # an unmatched payment is NOT marked processed: Dodo must retry it
            s.add(WebhookEvent(id=event_id, type=etype[:64], processed_at=datetime.now(UTC)))
    if unmatched is not None:
        return JSONResponse(status_code=500, content={"error": "unmatched_payment"})
    return JSONResponse({"ok": True})
