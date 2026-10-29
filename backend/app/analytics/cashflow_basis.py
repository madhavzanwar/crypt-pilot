"""One definition of "monthly income" and "committed recurring" for the dashboard, the statement and the budgets page.

Before this module the dashboard averaged every inflow of the last three months, the budgets page took the detected
salary amount, and "committed recurring" counted every merchant seen three times (weekly groceries, coffee, shopping and
the credit-card bill, whose purchases are also in the spend), so committed payments could exceed income and
safe-to-spend was permanently zero.

* income: trailing-`months` average of inflows (transfers and card-bill refunds excluded) -- `avg_income_expenses`.
* committed: detected recurring obligations in a fixed set of categories (rent, EMIs, utilities, subscriptions, education,
  SIPs) at their monthly run-rate. Habits such as dining or shopping are spending, not commitments; they are measured
  by what was actually spent. The card bill is excluded because the purchases it settles are already spend.
"""
from __future__ import annotations

import pandas as pd

from app.analytics.recurring import normalize_merchant
from app.schemas import RecurrenceFrequency, RecurringObligation, TxnCategory

# Not new spend / income: moving money between own accounts, paying a card bill (the purchases are the spend).
EXCLUDED_FROM_FLOWS = {TxnCategory.transfer.value, TxnCategory.credit_card_payment.value}

COMMITTED_CATEGORIES = {
    TxnCategory.rent_housing, TxnCategory.emi_loan, TxnCategory.utilities, TxnCategory.subscriptions,
    TxnCategory.education, TxnCategory.investment_sip,
}

_INTERVAL_DAYS = {
    RecurrenceFrequency.weekly: 7, RecurrenceFrequency.biweekly: 14, RecurrenceFrequency.monthly: 30,
    RecurrenceFrequency.quarterly: 90, RecurrenceFrequency.annual: 365,
}


def avg_income_expenses(df: pd.DataFrame, months: int = 3) -> tuple[float, float]:
    """Trailing-`months` average monthly (income, expenses); the window ends at the latest transaction."""
    if df.empty:
        return 0.0, 0.0
    work = df.copy()
    work["date"] = pd.to_datetime(work["date"])
    as_of = work["date"].max()
    window = work[(work["date"] > as_of - pd.DateOffset(months=months)) & (work["date"] <= as_of)]
    window = window[~window["category"].isin(EXCLUDED_FROM_FLOWS)]
    income_total = float(window.loc[window["amount"] > 0, "amount"].sum())
    expense_total = float(-window.loc[window["amount"] < 0, "amount"].sum())
    return income_total / months, expense_total / months


def monthly_equivalent(r: RecurringObligation) -> float:
    """Magnitude of a recurring item as a monthly run-rate (a quarterly 3000 is 1000 a month)."""
    return abs(r.amount) * (30.0 / _INTERVAL_DAYS.get(r.frequency, 30))


def is_committed(r: RecurringObligation) -> bool:
    return r.category in COMMITTED_CATEGORIES and r.amount < 0 and r.frequency != RecurrenceFrequency.irregular


def committed_monthly(recurring: list[RecurringObligation]) -> float:
    return sum(monthly_equivalent(r) for r in recurring if is_committed(r))


def committed_merchants(recurring: list[RecurringObligation]) -> set[str]:
    """Normalised merchant names of the committed items, so their payments are not counted a second time as spend."""
    return {normalize_merchant(r.merchant) for r in recurring if is_committed(r)}
