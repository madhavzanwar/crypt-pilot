from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_session_id, get_state
from app.errors import ApiError, UpstreamError
from app.logging_setup import log
from app.schemas.contract import CheckoutRequest, CheckoutResponse, CreditsResponse, ErrorResponse, PackOut
from app.services.billing import ledger
from app.services.billing.dodo import DodoClient
from app.state import AppState

router = APIRouter()


@router.get("/api/credits", response_model=CreditsResponse)
async def credits(state: AppState = Depends(get_state), sid: str = Depends(get_session_id)) -> CreditsResponse:
    with state.db.session() as s:
        ledger.ensure_session(s, sid, state.settings.starting_credits)
        bal = ledger.balance(s, sid)
    packs = [PackOut(id=p.id, credits=p.credits, price_usd=p.price_usd, label=p.label) for p in state.settings.packs]
    return CreditsResponse(balance=bal, packs=packs)


@router.post("/api/checkout", response_model=CheckoutResponse,
             responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def checkout(body: CheckoutRequest, state: AppState = Depends(get_state),
                   sid: str = Depends(get_session_id)) -> CheckoutResponse:
    pack = state.settings.pack(body.pack_id)
    if pack is None:
        raise ApiError(404, "unknown_pack")
    dodo = DodoClient(state.settings, state.http)
    if not dodo.configured:
        raise ApiError(503, "payments_unavailable")
    with state.db.session() as s:
        ledger.ensure_session(s, sid, state.settings.starting_credits)
    try:
        url = await dodo.create_checkout(pack, sid)
    except UpstreamError as exc:
        log.warning("dodo_checkout_failed", detail=exc.detail)
        raise ApiError(502, "payments_unavailable") from exc
    return CheckoutResponse(url=url)
