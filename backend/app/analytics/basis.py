"""One shared basis for "now" in every analytic.

"This month", trailing windows and forecasts are anchored on TODAY, never on the newest row in the ledger: a single
mis-dated transaction (year 2099) must not move the month a user sees. Rows dated after today are not part of the real
ledger yet, so every DataFrame built from transaction rows goes through `through_today`.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd


def today() -> date:
    return datetime.now(timezone.utc).date()


def through_today(df: pd.DataFrame, *, today_: date | None = None) -> pd.DataFrame:
    """Drop rows dated after today (UTC). Expects a `date` column (datetime or date); returns df unchanged if empty."""
    if df.empty or "date" not in df.columns:
        return df
    cutoff = pd.Timestamp(today_ or today())
    dates = pd.to_datetime(df["date"])
    return df[dates <= cutoff].reset_index(drop=True)
