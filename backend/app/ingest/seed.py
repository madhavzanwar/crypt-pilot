"""CLI to (re)seed the 3 demo personas into the configured database.

Also seeds Priya's household (Priya, Rishi, Swara, Vedant).

Usage (from backend/):
    python -m app.ingest.seed

Idempotent: safe to re-run -- clears and reinserts all rows for each demo
user_id (demo-priya, demo-arjun, demo-meera) rather than accumulating
duplicates.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from app.core import store
from app.models import (
    AccountRow,
    BudgetRow,
    CategorizationRuleRow,
    DebtRow,
    GoalRow,
    HouseholdInviteRow,
    HouseholdMemberRow,
    HouseholdRow,
    IncomeRow,
    TransactionRow,
)
from app.ingest.personas import FAMILY_CONFIGS, PERSONA_CONFIGS, generate_persona


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clear_user(user_id: str) -> None:
    for model in (TransactionRow, DebtRow, IncomeRow, AccountRow, CategorizationRuleRow,
                  BudgetRow, GoalRow, HouseholdMemberRow):
        store.delete_where(model, user_id=user_id)
    store.delete_where(HouseholdRow, owner_user_id=user_id)
    store.delete_where(HouseholdInviteRow, invited_by_user_id=user_id)


def seed_all() -> None:
    for user_id, config in PERSONA_CONFIGS.items():
        _clear_user(user_id)

        data = generate_persona(config)
        store.put(*data.accounts, *data.transactions, *data.debts, *data.incomes,
                  *data.rules, *data.budgets, *data.goals)

        print(
            f"Seeded {user_id}: {len(data.accounts)} accounts, "
            f"{len(data.transactions)} transactions, {len(data.debts)} debts, "
            f"{len(data.incomes)} incomes, {len(data.rules)} rules, {len(data.budgets)} budgets, "
            f"{len(data.goals)} goals"
        )

    seed_family()


FAMILY_HOUSEHOLD_ID = "hh-priya-family"


def seed_family() -> None:
    """Priya's household: Priya (owner), Rishi (editor), Swara and Vedant (viewers), each with their own accounts and
    synthetic spending so the Household page can show what everyone spends. Replaces any older demo household."""
    for uid, config in FAMILY_CONFIGS.items():
        for model in (TransactionRow, AccountRow, IncomeRow):
            store.delete_where(model, user_id=uid)
        store.delete_where(HouseholdMemberRow, user_id=uid)
        data = generate_persona(config)
        # accounts + spending only: no budgets, goals or rules for the family members
        store.put(*data.accounts, *data.transactions, *data.incomes)
        print(f"Seeded family member {uid}: {len(data.accounts)} accounts, {len(data.transactions)} transactions")

    # drop whatever demo household Priya owned before (e.g. the old "Priya & Partner Family") and its members/invites
    for old in store.query(HouseholdRow, owner_user_id="demo-priya"):
        store.delete_where(HouseholdMemberRow, household_id=old.id)
        store.delete_where(HouseholdInviteRow, household_id=old.id)
        store.delete(HouseholdRow, old.id)
    store.delete_where(HouseholdMemberRow, user_id="demo-priya")
    store.delete_where(HouseholdMemberRow, user_id="demo-arjun")

    now = datetime.now(timezone.utc)
    store.put(
        HouseholdRow(id=FAMILY_HOUSEHOLD_ID, name="Priya's Family", owner_user_id="demo-priya", created_at=now - timedelta(days=90)),
        HouseholdMemberRow(household_id=FAMILY_HOUSEHOLD_ID, user_id="demo-priya", role="owner", joined_at=now - timedelta(days=90)),
        HouseholdMemberRow(household_id=FAMILY_HOUSEHOLD_ID, user_id="demo-rishi", role="editor", joined_at=now - timedelta(days=88)),
        HouseholdMemberRow(household_id=FAMILY_HOUSEHOLD_ID, user_id="demo-swara", role="viewer", joined_at=now - timedelta(days=80)),
        HouseholdMemberRow(household_id=FAMILY_HOUSEHOLD_ID, user_id="demo-vedant", role="viewer", joined_at=now - timedelta(days=80)),
    )
    print("Seeded demo household: 'Priya's Family' (Priya, Rishi, Swara, Vedant)")


_ensure_lock = threading.RLock()  # re-entrant: ensure_demo_seeded calls seed_if_empty
_checked_at = 0.0
_RECHECK_SECONDS = 30.0


def _demo_missing() -> bool:
    return any(store.first(AccountRow, user_id=uid) is None for uid in PERSONA_CONFIGS)


def _family_missing() -> bool:
    return store.get(HouseholdRow, FAMILY_HOUSEHOLD_ID) is None or any(
        store.first(TransactionRow, user_id=uid) is None for uid in FAMILY_CONFIGS)


def warm_demo_caches() -> None:
    """Build the dashboard snapshot for each persona now so the first click in a demo is instant (it caches itself)."""
    from app.ingest.snapshot import build_dashboard_snapshot

    for uid in PERSONA_CONFIGS:
        try:
            build_dashboard_snapshot(uid)
        except Exception as exc:  # noqa: BLE001 - warming is an extra, never block the demo
            logging.getLogger(__name__).warning("warm %s failed: %s", uid, exc)


def seed_if_empty() -> None:
    """Seed the demo personas if any is missing (fresh/ephemeral DB, a wiped emulator, a serverless cold start),
    then warm their caches. Cheap no-op otherwise."""
    with _ensure_lock:  # the startup thread and a first request must not seed at the same time
        if _demo_missing():
            seed_all()
            warm_demo_caches()
        elif _family_missing():  # an existing database from before Priya's family was added
            seed_family()


def ensure_demo_seeded() -> None:
    """Called when a demo persona is requested: self-heals missing demo data, re-checking at most every 30 s per process.

    Only the very first check blocks a request; later re-checks run in the background so no request pays the Firestore round trips.
    """
    global _checked_at
    if time.monotonic() - _checked_at < _RECHECK_SECONDS:
        return
    if _checked_at and not _ensure_lock.acquire(blocking=False):
        return  # a refresh is already running
    elif not _checked_at:
        _ensure_lock.acquire()
    try:
        if time.monotonic() - _checked_at < _RECHECK_SECONDS:
            return
        if _checked_at:
            _checked_at = time.monotonic()  # claim this window, then refresh off the request path
            threading.Thread(target=seed_if_empty, daemon=True).start()
            return
        seed_if_empty()
        _checked_at = time.monotonic()
    finally:
        _ensure_lock.release()


if __name__ == "__main__":
    seed_all()
