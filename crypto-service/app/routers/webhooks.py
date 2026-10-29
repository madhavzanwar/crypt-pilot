from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.config import Pack
from app.db.models import SessionRow, UnmatchedPayment, WebhookEvent
from app.deps import get_state
from app.logging_setup import log
from app.services.billing import ledger
from app.services.billing.dodo import payment_extras, payment_fields
from app.services.billing.webhook_verify import WebhookVerificationError, verify
from app.state import AppState

router = APIRouter()

MAX_EVENT_ID = 128  # webhook_events.id is String(128): longer ids would fail on Postgres
REVOKE_EVENTS = frozenset({"payment.refunded", "refund.succeeded", "dispute.accepted", "dispute.lost"})


def _mismatch(pack: Pack, event: dict[str, object]) -> str | None:
    """Product / amount sanity check against the configured pack (only when the payload carries the fields)."""
    products, amount, currency = payment_extras(event)  # type: ignore[arg-type]
    if products and pack.dodo_product_id and pack.dodo_product_id not in products:
        return "product_mismatch"
    if amount is not None and currency == "USD" and amount < round(pack.price_usd * 100):
        return "amount_mismatch"
    return None


def _record_unmatched(state: AppState, event_id: str, payment_id: str | None, session_id: str | None,
                      pack_id: str | None, reason: str) -> None:
    """Persist (in its own committed transaction) a paid event we could not credit, for reconciliation."""
    now = datetime.now(UTC)
    with state.db.session() as s:
        row = s.get(UnmatchedPayment, event_id)
        if row is None:
            s.add(UnmatchedPayment(event_id=event_id, payment_id=(payment_id or "")[:128] or None,
                                   session_id=(session_id or "")[:128] or None,
                                   pack_id=(pack_id or "")[:128] or None, reason=reason))
        else:
            row.attempts += 1
            row.last_seen_at = now
            row.reason = reason


@router.post("/api/webhooks/dodo", include_in_schema=False)
async def dodo_webhook(request: Request, state: AppState = Depends(get_state)) -> JSONResponse:
    body = await request.body()
    try:
        event_id = verify(state.settings.dodo_webhook_secret.get_secret_value(), request.headers, body)
    except WebhookVerificationError as exc:
        log.warning("dodo_webhook_rejected", reason=str(exc))
        return JSONResponse(status_code=401, content={"error": "invalid_signature"})
    if len(event_id) > MAX_EVENT_ID:
        return JSONResponse(status_code=400, content={"error": "invalid_webhook_id"})
    try:
        event = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        return JSONResponse(status_code=400, content={"error": "invalid_json"})
    if not isinstance(event, dict):
        return JSONResponse(status_code=400, content={"error": "invalid_json"})
    etype = str(event.get("type", ""))
    unmatched: tuple[str | None, str | None, str | None, str] | None = None
    with state.db.session() as s:
        if s.get(WebhookEvent, event_id) is not None:
            return JSONResponse({"ok": True, "duplicate": True})
        if etype == "payment.succeeded":
            payment_id, session_id, pack_id, customer_id = payment_fields(event)
            pack = state.settings.pack(pack_id or "")
            reason: str | None = None
            if not payment_id:
                reason = "no_payment_id"
            elif not session_id:
                reason = "no_session"
            elif pack is None:
                reason = "unknown_pack"
            elif s.get(SessionRow, session_id) is None:
                reason = "unknown_session"
            else:
                reason = _mismatch(pack, event)
            if reason is None:
                assert payment_id and session_id and pack is not None
                s.add(WebhookEvent(id=event_id, type=etype[:64]))
                ledger.add_credits(s, session_id, pack.credits, "dodo", payment_id)
                row = s.get(SessionRow, session_id)
                if row is not None and customer_id:
                    row.dodo_customer_id = customer_id
                log.info("dodo_payment_credited", credits=pack.credits)
            else:
                unmatched = (payment_id, session_id, pack_id, reason)
        else:
            s.add(WebhookEvent(id=event_id, type=etype[:64]))
            if etype in REVOKE_EVENTS:
                data = event.get("data")
                pid = data.get("payment_id") if isinstance(data, dict) else None
                if isinstance(pid, str) and pid:
                    revoked = ledger.revoke_payment(s, pid)
                    log.info("dodo_payment_revoked", kind=etype, credits=revoked)
        if unmatched is None:
            ev_row = s.get(WebhookEvent, event_id)
            if ev_row is not None:
                ev_row.processed_at = datetime.now(UTC)
    if unmatched is not None:
        # Not marked processed, no ghost session: persisted for reconciliation and answered 5xx so Dodo retries
        # (a retry succeeds once the pack config / session is fixed).
        _record_unmatched(state, event_id, *unmatched)
        log.error("dodo_payment_unmatched", reason=unmatched[3], has_session=bool(unmatched[1]),
                  has_pack=unmatched[2] is not None)
        return JSONResponse(status_code=503, content={"error": "unmatched_payment"})
    return JSONResponse({"ok": True})
