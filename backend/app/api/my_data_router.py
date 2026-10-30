"""POST /api/my-data/{user_id}/delete: erase everything the app stores for one user. Irreversible."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import SQLModel

from app import models
from app.core import store
from app.core.audit import log_audit_event
from app.core.auth import resolve_user_id
from app.models import (
    AccountRow, AuditLogRow, HouseholdInviteRow, HouseholdMemberRow, HouseholdRow, SettlementRow, SharedExpenseRow, TransactionRow,
)

router = APIRouter()
logger = logging.getLogger(__name__)

CONFIRM = "DELETE MY DATA"
KEPT = ["Firebase sign-in account (delete it from your Google/Firebase account)"]


class DeleteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm: str


def _user_tables() -> list[type[SQLModel]]:
    """Every row model with a `user_id` column, found by scanning app.models, so a newly added collection is never forgotten."""
    return [
        m for m in vars(models).values()
        if isinstance(m, type) and issubclass(m, SQLModel) and m is not SQLModel and getattr(m, "__tablename__", None) and "user_id" in m.model_fields
    ]


def _wipe(model, counts: dict[str, int], **eq) -> None:
    n = len(store.query(model, **eq))
    if n:
        store.delete_where(model, **eq)
        counts[model.__tablename__] = counts.get(model.__tablename__, 0) + n


def _drop_household(household: HouseholdRow, counts: dict[str, int]) -> None:
    for m in store.query(HouseholdMemberRow, household_id=household.id):
        if m.is_managed:  # family members without a login: their wallet and ledger go with the household
            _wipe(TransactionRow, counts, user_id=m.user_id)
            _wipe(AccountRow, counts, user_id=m.user_id)
    _wipe(HouseholdMemberRow, counts, household_id=household.id)
    _wipe(HouseholdInviteRow, counts, household_id=household.id)
    _wipe(SharedExpenseRow, counts, household_id=household.id)
    _wipe(SettlementRow, counts, household_id=household.id)
    store.delete(HouseholdRow, household.id)
    counts[HouseholdRow.__tablename__] = counts.get(HouseholdRow.__tablename__, 0) + 1


def _bust_caches(user_id: str) -> None:
    """Server-side memory that could still show the deleted data (the store's own read cache is already invalidated by the deletes)."""
    try:
        from app.api import notifications_router
        from app.ingest import snapshot
        from app.rag import index

        notifications_router._memo.pop(user_id, None)
        snapshot._snapshots.pop(user_id, None)
        index._idx.pop(user_id, None)
        index._offline.discard(user_id)
        try:
            index._path(user_id).unlink(missing_ok=True)
        except OSError:
            pass
    except Exception:  # noqa: BLE001 - the data is already gone; a cache that cannot be cleared must not fail the request
        logger.exception("could not clear caches after data deletion")


@router.post("/api/my-data/{user_id}/delete")
def delete_my_data(body: DeleteBody, user_id: str = Depends(resolve_user_id)) -> dict:
    if user_id.startswith("demo-"):
        raise HTTPException(403, "Demo data is shared by every visitor and cannot be deleted. Sign in or start a guest session to use your own data.")
    if body.confirm != CONFIRM:
        raise HTTPException(400, f'To delete your data, send the exact confirmation "{CONFIRM}".')

    counts: dict[str, int] = {}
    # Households first (needs the membership rows before the generic sweep removes them).
    for mem in store.query(HouseholdMemberRow, user_id=user_id):
        household = store.get(HouseholdRow, mem.household_id)
        if household is None:
            continue
        owners = [m for m in store.query(HouseholdMemberRow, household_id=household.id) if m.role == "owner" and m.user_id != user_id]
        if mem.role == "owner" and not owners:
            _drop_household(household, counts)  # the only owner: the household goes with them
    for model in _user_tables():
        if model is AuditLogRow:
            continue
        _wipe(model, counts, user_id=user_id)  # includes leaving any household that stays
    _wipe(HouseholdInviteRow, counts, invited_by_user_id=user_id)
    _wipe(AuditLogRow, counts, user_id=user_id)  # the access log is personal data too

    _bust_caches(user_id)
    total = sum(counts.values())
    at = datetime.now(timezone.utc).isoformat()
    if total:
        # Receipt: when and how much, never what, and no user id.
        log_audit_event(user_id=None, event_type="data_deleted", method="POST", path="/api/my-data/delete", status_code=200,
                        detail=f"A user erased their data: {total} records across {len(counts)} collections")
    return {"deleted": counts, "total": total, "kept": KEPT, "at": at}
