"""Shared sanity limits for money amounts and dates that enter the ledger.

Everything that creates a transaction/event (timeline, household wallet, CSV/OCR import) goes through these, so one absurd
entry (year 2099, 99,99,99,99,999 rupees) can never become the ledger's "latest month" or swamp every total.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone

MIN_DATE = date(2000, 1, 1)
MAX_AMOUNT = 100_000_000.0  # Rs 10 crore per single transaction
FUTURE_SLACK_DAYS = 1  # a ledger entry may be dated at most a day ahead (time zones)
SIMULATION_HORIZON_DAYS = 366  # what-if events may look up to a year ahead


def today() -> date:
    return datetime.now(timezone.utc).date()


def check_amount(value: float, *, field: str = "amount", allow_zero: bool = False) -> float:
    """Return `value` unchanged, or raise ValueError with a message that is safe to show to the user."""
    if value is None or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{field} must be a finite number")
    if abs(value) > MAX_AMOUNT:
        raise ValueError(f"{field} is too large: the limit is Rs {MAX_AMOUNT:,.0f} per transaction")
    if not allow_zero and value == 0:
        raise ValueError(f"{field} must not be zero")
    return value


def check_date(value: date | None, *, field: str = "date", max_ahead_days: int = FUTURE_SLACK_DAYS) -> date | None:
    if value is None:
        return None
    if value < MIN_DATE:
        raise ValueError(f"{field} {value.isoformat()} is too far in the past: it cannot be before {MIN_DATE.isoformat()}")
    latest = today() + timedelta(days=max_ahead_days)
    if value > latest:
        what = "in the future" if max_ahead_days <= FUTURE_SLACK_DAYS else f"more than {max_ahead_days} days ahead"
        raise ValueError(f"{field} {value.isoformat()} is too far {what}: the latest allowed date is {latest.isoformat()}")
    return value
