"""Plaid linking for the Connectors page: Link token -> (Plaid Link in the browser) -> one-time import of accounts and transactions."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import plaid
from app.core import store
from app.core.auth import DEMO_USER_IDS, resolve_user_id
from app.ingest.seed import _clear_user
from app.models import AccountRow, ConnectionRow, InsightsSnapshotRow, TransactionRow

router = APIRouter(prefix="/api/plaid", tags=["plaid"])


class ImportBody(BaseModel):
    public_token: str


def clear_plaid(user_id: str) -> None:
    """Remove only what Plaid brought in (demo personas keep their fixtures)."""
    for a in store.query(AccountRow, user_id=user_id):
        if a.id.startswith(f"{user_id}-plaid-"):
            store.delete_where(TransactionRow, user_id=user_id, account_id=a.id)
            store.delete(AccountRow, a.id)


def _fail(e: plaid.PlaidError):
    raise HTTPException(e.status, str(e)) from e


@router.post("/{user_id}/link-token")
def link_token(user_id: str = Depends(resolve_user_id)) -> dict:
    try:
        return {"link_token": plaid.link_token(user_id)}
    except plaid.PlaidError as e:
        _fail(e)


@router.post("/{user_id}/import")
def import_data(body: ImportBody, user_id: str = Depends(resolve_user_id)) -> dict:
    try:
        accounts, txns = plaid.to_rows(user_id, *plaid.fetch(plaid.exchange(body.public_token)))
    except plaid.PlaidError as e:
        _fail(e)
    clear_plaid(user_id) if user_id in DEMO_USER_IDS else _clear_user(user_id)
    store.put(*accounts, *txns)
    store.delete_where(InsightsSnapshotRow, user_id=user_id)
    store.put(ConnectionRow(id=f"{user_id}:plaid", user_id=user_id, connector="plaid", detail=f"{len(accounts)} accounts, {len(txns)} transactions",
                            connected_at=datetime.now(timezone.utc)))
    return {"connected": True, "accounts": len(accounts), "transactions": len(txns)}
