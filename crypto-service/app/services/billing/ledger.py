"""Append-only credit ledger. The ledger is the only source of truth for balances."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings

from app.db.models import CreditLedger, FreeGrant, SessionRow
from app.logging_setup import log


def ensure_for_request(s: Session, settings: Settings, session_id: str) -> bool:
    """ensure_session with the request's client IP (set by the middleware) and the configured daily cap."""
    from app.ratelimit import client_ip_var

    ip = client_ip_var.get()
    return ensure_session(s, session_id, settings.starting_credits, client_ip=ip,
                          daily_cap=settings.free_sessions_per_ip_per_day if _ip_identifies_visitor(ip, settings) else 0,
                          salt=settings.log_salt.get_secret_value())


def _ip_identifies_visitor(ip: str | None, settings: Settings) -> bool:
    """The per-IP free-grant cap is only fair when the IP tells visitors apart.

    Behind the bridge without CRYPTO_TRUST_PROXY every request arrives from loopback/private, so one shared bucket
    would hand out the daily quota to the first N visitors and leave everyone else with 0 credits. Skip the cap then.
    """
    if not ip:
        return False
    if settings.trust_proxy:
        return True
    import ipaddress

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_loopback or addr.is_private or addr.is_link_local)


def balance(s: Session, session_id: str) -> int:
    total = s.scalar(select(func.coalesce(func.sum(CreditLedger.delta), 0)).where(
        CreditLedger.session_id == session_id))
    return int(total or 0)


def _grant_allowed(s: Session, ip: str, salt: str, cap: int) -> bool:
    """Count this new session against the client IP's daily budget of free grants."""
    ip_hash = hashlib.sha256(f"{salt}|{ip}".encode()).hexdigest()[:32]
    day = datetime.now(UTC).strftime("%Y-%m-%d")
    row = s.get(FreeGrant, (ip_hash, day))
    if row is None:
        s.add(FreeGrant(ip_hash=ip_hash, day=day, count=1))
        return True
    if row.count >= cap:
        return False
    row.count += 1
    return True


def ensure_session(s: Session, session_id: str, starting_credits: int, *, client_ip: str | None = None,
                   daily_cap: int = 0, salt: str = "") -> bool:
    """Create the session and its starting grant if missing. Returns True if created.

    With `daily_cap` > 0 and a `client_ip`, at most `daily_cap` new sessions per IP per UTC day receive the free
    starting credits; later ones are created with none (cookie-dropping cannot mint credits without bound).
    """
    if s.get(SessionRow, session_id) is not None:
        return False
    s.add(SessionRow(id=session_id))
    s.flush()
    if starting_credits > 0 and daily_cap > 0 and client_ip:
        if not _grant_allowed(s, client_ip, salt, daily_cap):
            log.info("free_grant_capped")
            return True
    if starting_credits > 0:
        s.add(CreditLedger(session_id=session_id, delta=starting_credits, reason="starting", ref=session_id))
    return True


class UnknownSessionError(LookupError):
    """Credits were requested for a session id that does not exist (never minted implicitly)."""


def add_credits(s: Session, session_id: str, delta: int, reason: str, ref: str) -> bool:
    """Idempotent grant: the (reason, ref) pair is unique, so a replayed event adds nothing.

    Returns True if credits were added. Raises UnknownSessionError for a session that does not exist.
    """
    if s.get(SessionRow, session_id) is None:
        raise UnknownSessionError(session_id)
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
