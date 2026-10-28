from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header

from app.deps import get_session_id, get_state
from app.errors import ApiError
from app.schemas.contract import CryptoInvoiceRequest, CryptoInvoiceResponse, CryptoInvoiceStatus, ErrorResponse
from app.services.billing.crypto import CryptoInvoices
from app.state import AppState

router = APIRouter()


def _svc(state: AppState) -> CryptoInvoices:
    return CryptoInvoices(state.settings, state.db, state.http)


@router.post("/api/crypto-invoice", response_model=CryptoInvoiceResponse, response_model_exclude_none=True,
             responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def create_invoice(body: CryptoInvoiceRequest, state: AppState = Depends(get_state),
                         sid: str = Depends(get_session_id)) -> CryptoInvoiceResponse:
    pack = state.settings.pack(body.pack_id)
    if pack is None:
        raise ApiError(404, "unknown_pack")
    inv = _svc(state).create(sid, pack, body.coin)
    return CryptoInvoiceResponse(invoice_id=inv.id, uri=inv.uri, address=inv.address, amount=inv.amount,
                                 coin=body.coin, expires_at=inv.expires_at.isoformat(),
                                 provider="explorer" if body.coin == "btc" else "demo")


@router.get("/api/crypto-invoice/{invoice_id}", response_model=CryptoInvoiceStatus,
            responses={404: {"model": ErrorResponse}})
async def invoice_status(invoice_id: str, state: AppState = Depends(get_state),
                         sid: str = Depends(get_session_id)) -> CryptoInvoiceStatus:
    status = await _svc(state).refresh(invoice_id[:64], sid)
    return CryptoInvoiceStatus(status=status)


@router.post("/api/admin/crypto-invoice/{invoice_id}/mark-paid", response_model=CryptoInvoiceStatus,
             include_in_schema=False)
async def admin_mark_paid(invoice_id: str, state: AppState = Depends(get_state),
                          x_admin_token: str = Header(default="")) -> CryptoInvoiceStatus:
    """Demo-only (Monero has no automatic confirmation). Disabled unless ADMIN_TOKEN is set."""
    token = state.settings.admin_token.get_secret_value()
    if not token or token == "change_me" or not hmac.compare_digest(x_admin_token.encode(), token.encode()):  # noqa: S105
        raise ApiError(403, "forbidden")
    return CryptoInvoiceStatus(status=_svc(state).mark_paid(invoice_id[:64], txid=None))
