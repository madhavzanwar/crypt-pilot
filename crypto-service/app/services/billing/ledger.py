"""Append-only credit ledger. The ledger is the only source of truth for balances."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import CreditLedger, SessionRow


def balance(s: Session, session_id: str) -> int:
    total = s.scalar(select(func.coalesce(func.sum(CreditLedger.delta), 0)).where(
        CreditLedger.session_id == session_id))
    return int(total or 0)


def ensure_session(s: Session, session_id: str, starting_credits: int) -> bool:
    """Create the session and its starting grant if missing. Returns True if created."""
    if s.get(SessionRow, session_id) is not None:
        return False
    s.add(SessionRow(id=session_id))
    s.flush()
    if starting_credits > 0:
        s.add(CreditLedger(session_id=session_id, delta=starting_credits, reason="starting", ref=session_id))
    return True


def add_credits(s: Session, session_id: str, delta: int, reason: str, ref: str) -> bool:
    """Idempotent grant: the (reason, ref) pair is unique, so a replayed event adds nothing.

    Returns True if credits were added.
    """
    if s.get(SessionRow, session_id) is None:
        s.add(SessionRow(id=session_id))
        s.flush()
    exists = s.scalar(select(CreditLedger.id).where(CreditLedger.reason == reason, CreditLedger.ref == ref))
    if exists is not None:
        return False
    try:
        with s.begin_nested():
            s.add(CreditLedger(session_id=session_id, delta=delta, reason=reason, ref=ref))
    except IntegrityError:
        return False
    return True


def try_charge(s: Session, session_id: str, ref: str, amount: int = 1) -> int | None:
    """Deduct inside the caller's transaction (BEGIN IMMEDIATE on SQLite => serialised).

    Returns the new balance, or None if the balance is insufficient.
    """
    current = balance(s, session_id)
    if current < amount:
        return None
    s.add(CreditLedger(session_id=session_id, delta=-amount, reason="check", ref=ref))
    s.flush()
    return current - amount
