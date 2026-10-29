"""Account Aggregator linking: consent -> OTP approval -> encrypted data import. Powers the "Link accounts" button."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.aa import AAError, mapper, mock, setu
from app.core import store
from app.core.auth import DEMO_USER_IDS, resolve_user_id
from app.ingest.seed import _clear_user
from app.models import ConnectionRow, InsightsSnapshotRow, TransactionRow

router = APIRouter(prefix="/api/aa", tags=["account-aggregator"])


class ConsentBody(BaseModel):
    mobile: str
    profile: str = "priya"  # which sample bank customer the mock AA returns
    months: int = 12
    return_url: str = ""  # where Setu sends the user back after approving (real AA only)


class ApproveBody(BaseModel):
    handle: str
    otp: str


class ImportBody(BaseModel):
    consent_id: str


def _fail(e: AAError):
    raise HTTPException(e.status, str(e)) from e


@router.post("/{user_id}/consent")
def create_consent(body: ConsentBody, user_id: str = Depends(resolve_user_id)) -> dict:
    try:
        if setu.enabled():
            if not mock._MOBILE.match(body.mobile or "") or not 1 <= body.months <= 24 or not body.return_url.startswith(("http://", "https://")):
                raise AAError("Enter the 10-digit mobile number linked to your bank accounts.", 422)
            return setu.create_consent(body.mobile, body.months, body.return_url)
        return {**mock.create_consent(body.mobile, body.profile, body.months, user_id), "demo_otp": mock.DEMO_OTP}
    except AAError as e:
        _fail(e)


@router.post("/{user_id}/consent/approve")
def approve(body: ApproveBody, user_id: str = Depends(resolve_user_id)) -> dict:
    try:
        if mock.owner(body.handle, "handle") != user_id:
            raise AAError("This consent was issued to a different user. Start again.", 403)
        return mock.approve(body.handle, body.otp)
    except AAError as e:
        _fail(e)


@router.post("/{user_id}/import")
def import_data(body: ImportBody, user_id: str = Depends(resolve_user_id)) -> dict:
    """Fetch the consented data, decrypt it, and replace the user's ledger with it (demo personas keep their fixtures)."""
    try:
        if setu.enabled():
            fi = setu.fetch(body.consent_id)
        else:
            if mock.owner(body.consent_id, "consent") != user_id:
                raise AAError("This consent was issued to a different user. Start again.", 403)
            priv, pub = mock.new_keypair()
            fi = mock.decrypt(priv, mock.fetch(body.consent_id, pub))
        accounts, txns = mapper.to_rows(user_id, fi)
    except AAError as e:
        _fail(e)
    if user_id in DEMO_USER_IDS:
        n = len(store.query(TransactionRow, user_id=user_id))
        detail = f"{len(accounts)} accounts via Account Aggregator"
        stats = {"accounts": len(accounts), "transactions": n}
    else:
        _clear_user(user_id)
        store.put(*accounts, *txns)
        detail = f"{len(accounts)} accounts via Account Aggregator"
        stats = {"accounts": len(accounts), "transactions": len(txns)}
    store.delete_where(InsightsSnapshotRow, user_id=user_id)
    store.put(ConnectionRow(id=f"{user_id}:google_pay", user_id=user_id, connector="google_pay", detail=detail,
                            connected_at=datetime.now(timezone.utc)))
    return {"connected": True, **stats}
