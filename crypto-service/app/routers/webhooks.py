from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.db.models import SessionRow, WebhookEvent
from app.deps import get_state
from app.logging_setup import log
from app.services.billing import ledger
from app.services.billing.dodo import payment_fields
from app.services.billing.webhook_verify import WebhookVerificationError, verify
from app.state import AppState

router = APIRouter()


@router.post("/api/webhooks/dodo", include_in_schema=False)
async def dodo_webhook(request: Request, state: AppState = Depends(get_state)) -> JSONResponse:
    body = await request.body()
    try:
        event_id = verify(state.settings.dodo_webhook_secret.get_secret_value(), request.headers, body)
    except WebhookVerificationError as exc:
        log.warning("dodo_webhook_rejected", reason=str(exc))
        return JSONResponse(status_code=401, content={"error": "invalid_signature"})
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "invalid_json"})
    etype = str(event.get("type", ""))
    with state.db.session() as s:
        if s.get(WebhookEvent, event_id) is not None:
            return JSONResponse({"ok": True, "duplicate": True})
        s.add(WebhookEvent(id=event_id, type=etype[:64]))
        if etype == "payment.succeeded":
            payment_id, session_id, pack_id, customer_id = payment_fields(event)
            pack = state.settings.pack(pack_id or "")
            if payment_id and session_id and pack is not None:
                ledger.add_credits(s, session_id, pack.credits, "dodo", payment_id)
                row = s.get(SessionRow, session_id)
                if row is not None and customer_id:
                    row.dodo_customer_id = customer_id
                log.info("dodo_payment_credited", credits=pack.credits)
            else:
                log.warning("dodo_payment_unmatched", has_session=bool(session_id), has_pack=pack is not None)
        ev_row = s.get(WebhookEvent, event_id)
        if ev_row is not None:
            ev_row.processed_at = datetime.now(UTC)
    return JSONResponse({"ok": True})
