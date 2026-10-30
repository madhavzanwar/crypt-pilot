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


_NOT_SPEND_OR_INCOME = ("transfer", "credit_card_payment")


def pay_month(df: pd.DataFrame) -> pd.Series:
    """Month ('Period[M]') each row belongs to for income purposes: a salary credited on the 28th or later is next month's
    pay (payroll dates jitter around month ends; counted where they land, a window holds two salaries or four)."""
    d = pd.to_datetime(df["date"])
    month = d.dt.to_period("M")
    return month.where(d.dt.day < 28, month + 1)


def trailing_income_expenses(df: pd.DataFrame, months: int = 3, as_of=None) -> tuple[float, float]:
    """(income_total, expense_total) over the trailing `months` months: THE basis shared by the dashboard, savings rate,
    forecast baseline and what-ifs.

    Expenses: outflows in the rolling window ending at `as_of` (default: latest transaction dated no later than today),
    excluding transfers and card-bill payments. Income: category=income credits are bucketed by pay month (see `pay_month`)
    and the last `months` pay months are summed; other inflows (refunds, interest) use the rolling window."""
    if df.empty:
        return 0.0, 0.0
    work = through_today(df.copy())
    if work.empty:
        return 0.0, 0.0
    work["date"] = pd.to_datetime(work["date"])
    as_of_ts = pd.Timestamp(as_of) if as_of is not None else work["date"].max()
    work = work[work["date"] <= as_of_ts]
    start = as_of_ts - pd.DateOffset(months=months)
    window = work[(work["date"] > start) & ~work["category"].isin(_NOT_SPEND_OR_INCOME)]
    expense = float(-window.loc[window["amount"] < 0, "amount"].sum())

    is_pay = (work["amount"] > 0) & (work["category"] == "income")
    pay = work[is_pay]
    income = 0.0
    if not pay.empty:
        pm = pay_month(pay)
        last = pm.max()
        income += float(pay.loc[pm > last - months, "amount"].sum())
    other = window[(window["amount"] > 0) & (window["category"] != "income")]
    income += float(other["amount"].sum())
    return income, expense
