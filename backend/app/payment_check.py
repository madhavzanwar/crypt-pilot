"""Automatic security review and dashboard impact of one UPI payment.

Pure and deterministic: rules over the user's own history, no model and no network, so the same history and
payment always give the same review. The thresholds are product choices and are listed in the check details.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

import pandas as pd
from pydantic import BaseModel

UPI_LIMIT = 100_000.0  # per-transaction cap
HEAVY_MIN = 5_000.0  # never "heavy" below this
HEAVY_ALWAYS = 25_000.0
HEAVY_MULTIPLE = 5.0  # of the user's median payment
IST = timezone(timedelta(hours=5, minutes=30))
_ESSENTIAL = {"rent_housing", "emi_loan", "utilities", "groceries", "healthcare"}
_NON_SPEND = {"income", "transfer", "credit_card_payment", "investment_sip"}

Status = Literal["pass", "warn", "fail", "info"]


class Check(BaseModel):
    key: str
    label: str
    status: Status
    detail: str


class Impact(BaseModel):
    balance_before: float
    balance_after: float
    pct_of_balance: float
    month_spend_before: float
    month_spend_after: float
    avg_month_spend: float
    spend_vs_avg_pct: float | None  # month-to-date after this payment vs a full typical month
    category: str
    category_month_after: float
    category_avg: float
    budget_limit: float | None
    budget_used_pct: float | None
    runway_months: float | None  # balance after / typical monthly essentials


class PaymentReview(BaseModel):
    id: str
    heavy: bool
    verdict: Literal["secure", "review", "suspicious"]
    headline: str
    checks: list[Check]
    impact: Impact
    insights: list[str]


def _inr(v: float) -> str:
    return f"₹{v:,.0f}"


def assess(
    *, txn_id: str, df: pd.DataFrame, amount: float, payee: str, upi_id: str, category: str, balance_before: float,
    budget_limit: float | None, now: datetime | None = None,
) -> PaymentReview:
    """`df` is the user's transactions BEFORE this payment (columns date, amount, merchant, category, description)."""
    now = (now or datetime.now(IST)).astimezone(IST)
    out = df[(df["amount"] < 0) & ~df["category"].isin(_NON_SPEND)].copy() if not df.empty else df
    spend = (-out["amount"]) if not out.empty else pd.Series(dtype=float)
    median = float(spend.median()) if len(spend) else 0.0
    biggest = float(spend.max()) if len(spend) else 0.0

    heavy = amount >= HEAVY_ALWAYS or (amount >= HEAVY_MIN and median > 0 and amount >= HEAVY_MULTIPLE * median)
    balance_after = balance_before - amount

    # ---- month-to-date and typical-month spend (from history only) ----
    month_spend_before = month_spend_avg = cat_month = cat_avg = essentials = 0.0
    if not out.empty:
        out["m"] = pd.to_datetime(out["date"]).dt.to_period("M")
        cur = pd.Period(now.strftime("%Y-%m"))
        per_month = out.groupby("m")["amount"].sum().abs()
        month_spend_before = float(per_month.get(cur, 0.0))
        past = per_month[per_month.index < cur]
        month_spend_avg = float(past.mean()) if len(past) else 0.0
        by_cat = out[out["category"] == category].groupby("m")["amount"].sum().abs()
        cat_month = float(by_cat.get(cur, 0.0))
        past_c = by_cat[by_cat.index < cur]
        cat_avg = float(past_c.mean()) if len(past_c) else 0.0
        ess = out[out["category"].isin(_ESSENTIAL)].groupby("m")["amount"].sum().abs()
        ess_past = ess[ess.index < cur]
        essentials = float(ess_past.mean()) if len(ess_past) else 0.0

    month_after = month_spend_before + amount
    cat_after = cat_month + amount
    impact = Impact(
        balance_before=round(balance_before, 2), balance_after=round(balance_after, 2),
        pct_of_balance=round(amount / balance_before * 100, 1) if balance_before > 0 else 100.0,
        month_spend_before=round(month_spend_before, 2), month_spend_after=round(month_after, 2),
        avg_month_spend=round(month_spend_avg, 2),
        spend_vs_avg_pct=round((month_after / month_spend_avg - 1) * 100, 0) if month_spend_avg > 0 else None,
        category=category, category_month_after=round(cat_after, 2), category_avg=round(cat_avg, 2),
        budget_limit=budget_limit, budget_used_pct=round(cat_after / budget_limit * 100, 0) if budget_limit else None,
        runway_months=round(balance_after / essentials, 1) if essentials > 0 and balance_after > 0 else (0.0 if essentials > 0 else None),
    )

    # ---- security checks ----
    checks: list[Check] = []

    def add(key: str, label: str, status: Status, detail: str) -> None:
        checks.append(Check(key=key, label=label, status=status, detail=detail))

    add("limit", "Within UPI limit", "pass" if amount <= UPI_LIMIT else "fail",
        f"{_inr(amount)} against the {_inr(UPI_LIMIT)} per-payment UPI limit.")
    add("pin", "UPI PIN verified", "pass", "The payment was authorised with the UPI PIN on the device.")
    known = (not out.empty) and out["merchant"].str.casefold().eq(payee.casefold()).any()
    add("payee", "Payee recognised", "pass" if known else "warn",
        f"You have paid {payee} before." if known else f"First payment to {payee} ({upi_id}); no earlier history with this payee.")
    if median > 0:
        mult = amount / median
        add("usual", "Size vs your usual", "pass" if mult <= 10 else "warn",
            f"{mult:.0f}x your typical payment ({_inr(median)}); your largest earlier payment was {_inr(biggest)}."
            if mult > 1.5 else f"In line with your typical payment ({_inr(median)}).")
    else:
        add("usual", "Size vs your usual", "info", "Not enough payment history to compare against.")
    if balance_after < 0:
        add("funds", "Sufficient balance", "fail", f"Balance would go to {_inr(balance_after)}.")
    elif essentials > 0 and balance_after < essentials:
        add("funds", "Sufficient balance", "warn",
            f"{_inr(balance_after)} left, less than one month of essentials ({_inr(essentials)}).")
    else:
        add("funds", "Sufficient balance", "pass", f"{_inr(balance_after)} left after paying.")
    today_total = amount
    if not df.empty and "description" in df:
        upi_today = df[(pd.to_datetime(df["date"]).dt.date == now.date()) & df["description"].fillna("").str.startswith("UPI to")]
        today_total += float((-upi_today["amount"]).sum())
    add("velocity", "Daily UPI activity", "pass" if today_total <= UPI_LIMIT else "warn",
        f"{_inr(today_total)} sent by UPI today in total." + ("" if today_total <= UPI_LIMIT else f" That is above {_inr(UPI_LIMIT)}, the usual daily cap."))
    late = now.hour >= 23 or now.hour < 5
    add("time", "Time of day", "warn" if late else "pass",
        f"Paid at {now:%I:%M %p} IST" + (", outside your usual hours." if late else "."))

    fails = sum(c.status == "fail" for c in checks)
    warns = sum(c.status == "warn" for c in checks)
    verdict: Literal["secure", "review", "suspicious"] = "suspicious" if fails else "review" if warns >= 2 else "secure"
    headline = {
        "secure": f"Security check passed. This {_inr(amount)} payment to {payee} looks safe.",
        "review": f"Please review. This {_inr(amount)} payment to {payee} passed most checks but raised {warns} flags.",
        "suspicious": f"Check this payment. {_inr(amount)} to {payee} failed a security check.",
    }[verdict]

    insights: list[str] = [f"Your balance moved from {_inr(balance_before)} to {_inr(balance_after)} ({impact.pct_of_balance:.0f}% of it)."]
    if impact.spend_vs_avg_pct is not None:
        up = impact.spend_vs_avg_pct
        insights.append(
            f"Spending this month is now {_inr(month_after)}, {abs(up):.0f}% {'above' if up >= 0 else 'below'} your usual full month ({_inr(month_spend_avg)})."
        )
    cat_label = category.replace("_", " ")
    if cat_avg > 0:
        insights.append(f"{cat_label.capitalize()} spending this month is {_inr(cat_after)} against a usual {_inr(cat_avg)}.")
    if budget_limit:
        pct = cat_after / budget_limit * 100
        insights.append(f"That uses {pct:.0f}% of your {cat_label} budget ({_inr(budget_limit)})" + (", which is over the limit." if pct > 100 else "."))
    if impact.runway_months is not None:
        insights.append(f"Your balance now covers about {impact.runway_months:.1f} months of essential spending.")

    return PaymentReview(id=txn_id, heavy=heavy, verdict=verdict, headline=headline, checks=checks, impact=impact, insights=insights)
