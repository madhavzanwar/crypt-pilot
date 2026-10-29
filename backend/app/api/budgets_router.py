"""Budgets: per-category monthly limits, spend-vs-limit status, and a
"safe to spend today" number. Owned by ledger-budgets-backend-agent --
exported as `router` for the integration lead to `app.include_router(...)`
into `app.main`. Deliberately does NOT touch app/api/routes.py or
app/main.py to avoid merge conflicts with the sibling goals/net-worth agent.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from app.analytics.cashflow_basis import avg_income_expenses, committed_merchants, committed_monthly
from app.analytics.recurring import detect_recurring, normalize_merchant
from app.core import store
from app.core.auth import resolve_user_id
from app.models import BudgetRow, TransactionRow
from app.schemas import (
    Budget,
    BudgetCreateRequest,
    BudgetStatus,
    BudgetUpdateRequest,
    RecurringObligation,
    SafeToSpend,
    TxnCategory,
)

router = APIRouter()

# Categories that are not real discretionary/committed spend for
# safe-to-spend purposes -- same exclusion app.analytics.savings and
# app.ingest.snapshot use (transfers between own accounts aren't new spend;
# a credit-card bill payment double-counts spend already booked against the
# original purchase category).
_EXCLUDED_FROM_SPEND = {TxnCategory.transfer.value, TxnCategory.credit_card_payment.value}

_NEAR_THRESHOLD = 0.8  # 80% of limit


def _transactions_df(rows: list[TransactionRow]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["id", "user_id", "account_id", "date", "amount", "merchant", "category", "is_recurring", "recurring_group_id"]
        )
    df = pd.DataFrame([r.model_dump() for r in rows])
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


def _compute_rollover(
    df: pd.DataFrame, category: str, monthly_limit: float, rollover_cap: float | None, as_of: date
) -> float:
    """Compute cumulative unspent budget surplus across prior calendar months up to 12 months back."""
    if df.empty or monthly_limit <= 0:
        return 0.0

    surplus_total = 0.0
    for m_offset in range(1, 13):
        y = as_of.year
        m = as_of.month - m_offset
        while m <= 0:
            m += 12
            y -= 1

        month_txns = df[
            (df["category"] == category)
            & (df["amount"] < 0)
            & (df["date"].dt.year == y)
            & (df["date"].dt.month == m)
            & (~df["category"].isin(_EXCLUDED_FROM_SPEND))
        ]
        any_txns = df[(df["date"].dt.year == y) & (df["date"].dt.month == m)]
        if any_txns.empty:
            continue

        month_spent = float(-month_txns["amount"].sum())
        month_surplus = max(0.0, monthly_limit - month_spent)
        surplus_total += month_surplus

    if rollover_cap is not None and rollover_cap > 0:
        return round(min(surplus_total, rollover_cap), 2)
    return round(surplus_total, 2)


@router.get("/budgets/{user_id}", response_model=list[Budget])
def list_budgets(user_id: str = Depends(resolve_user_id)) -> list[Budget]:
    rows = store.query(BudgetRow, user_id=user_id)
    return [
        Budget(
            id=r.id,
            user_id=r.user_id,
            category=r.category,
            monthly_limit=r.monthly_limit,
            rollover_enabled=bool(r.rollover_enabled),
            rollover_cap=r.rollover_cap,
        )
        for r in rows
    ]


@router.post("/budgets/{user_id}", response_model=Budget)
def upsert_budget(req: BudgetCreateRequest, user_id: str = Depends(resolve_user_id)) -> Budget:
    if req.monthly_limit < 0:
        raise HTTPException(400, "monthly_limit must be >= 0")

    existing = store.first(BudgetRow, user_id=user_id, category=req.category.value)
    if existing is not None:
        existing.monthly_limit = req.monthly_limit
        existing.rollover_enabled = req.rollover_enabled
        existing.rollover_cap = req.rollover_cap
        row = existing
    else:
        row = BudgetRow(
            user_id=user_id,
            category=req.category.value,
            monthly_limit=req.monthly_limit,
            rollover_enabled=req.rollover_enabled,
            rollover_cap=req.rollover_cap,
        )
    store.put(row)

    return Budget(
        id=row.id,
        user_id=row.user_id,
        category=row.category,
        monthly_limit=row.monthly_limit,
        rollover_enabled=bool(row.rollover_enabled),
        rollover_cap=row.rollover_cap,
    )


@router.patch("/budgets/{user_id}/{budget_id}", response_model=Budget)
def patch_budget(
    budget_id: str,
    req: BudgetUpdateRequest,
    user_id: str = Depends(resolve_user_id),
) -> Budget:
    row = store.get(BudgetRow, budget_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(404, "Budget not found")

    if req.monthly_limit is not None:
        if req.monthly_limit < 0:
            raise HTTPException(400, "monthly_limit must be >= 0")
        row.monthly_limit = req.monthly_limit
    if req.rollover_enabled is not None:
        row.rollover_enabled = req.rollover_enabled
    if req.rollover_cap is not None:
        row.rollover_cap = req.rollover_cap

    store.put(row)

    return Budget(
        id=row.id,
        user_id=row.user_id,
        category=row.category,
        monthly_limit=row.monthly_limit,
        rollover_enabled=bool(row.rollover_enabled),
        rollover_cap=row.rollover_cap,
    )


@router.delete("/budgets/{user_id}/{budget_id}")
def delete_budget(budget_id: str, user_id: str = Depends(resolve_user_id)) -> dict:
    row = store.get(BudgetRow, budget_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(404, "Budget not found")
    store.delete(BudgetRow, budget_id)
    return {"deleted": True, "id": budget_id}


def _spent_this_month(df: pd.DataFrame, category: str, as_of: date) -> float:
    """Sum of |outflow| for `category` in the current calendar month
    (as_of.year/as_of.month), excluding transfers/CC-bill-payments (see
    module docstring)."""
    if df.empty:
        return 0.0
    work = df[
        (df["category"] == category)
        & (df["amount"] < 0)
        & (df["date"].dt.year == as_of.year)
        & (df["date"].dt.month == as_of.month)
        & (~df["category"].isin(_EXCLUDED_FROM_SPEND))
    ]
    return float(-work["amount"].sum())


@router.get("/budgets/{user_id}/status", response_model=list[BudgetStatus])
def budget_status(user_id: str = Depends(resolve_user_id)) -> list[BudgetStatus]:
    today = datetime.now(timezone.utc).date()

    budgets = store.query(BudgetRow, user_id=user_id)
    txn_rows = store.query(TransactionRow, user_id=user_id)

    df = _transactions_df(list(txn_rows))

    statuses: list[BudgetStatus] = []
    for b in budgets:
        spent = _spent_this_month(df, b.category, today)
        rollover = (
            _compute_rollover(df, b.category, b.monthly_limit, b.rollover_cap, today)
            if b.rollover_enabled
            else 0.0
        )
        effective_limit = b.monthly_limit + rollover
        remaining = b.monthly_limit - spent
        total_available = effective_limit - spent
        percent_used = (spent / effective_limit * 100.0) if effective_limit > 0 else (100.0 if spent > 0 else 0.0)

        if spent > effective_limit + 1e-9:  # also true for a zero limit with any spend
            health = "over"
        elif percent_used >= _NEAR_THRESHOLD * 100.0:
            health = "near"
        else:
            health = "under"

        statuses.append(
            BudgetStatus(
                category=b.category,
                monthly_limit=b.monthly_limit,
                spent_so_far=round(spent, 2),
                remaining=round(remaining, 2),
                percent_used=round(percent_used, 1),
                status=health,
                rollover_amount=round(rollover, 2),
                total_available=round(total_available, 2),
                rollover_enabled=bool(b.rollover_enabled),
                rollover_cap=b.rollover_cap,
            )
        )
    return statuses


def _monthly_income(df: pd.DataFrame, recurring_all: list[RecurringObligation]) -> float:
    """Monthly income used as the safe-to-spend basis: the same trailing-3-month average the dashboard and the statement
    show (app.analytics.cashflow_basis.avg_income_expenses), so the three pages cannot disagree."""
    return avg_income_expenses(df)[0]


@router.get("/budgets/{user_id}/safe-to-spend", response_model=SafeToSpend)
def safe_to_spend(user_id: str = Depends(resolve_user_id)) -> SafeToSpend:
    """"Safe to spend today" = how much of today's remaining discretionary
    budget for the rest of THIS calendar month is still unspent, spread
    evenly across the days left in the month.

    Formula (documented here since this is a judged, user-facing number):

        safe_to_spend = max(
            0,
            (monthly_income
             - committed_recurring_this_month   # rent, EMIs, subscriptions, etc.
             - discretionary_spend_so_far_this_month)
            / days_remaining_in_current_month
        )

    Where:
      * `monthly_income` -- the trailing-3-month average inflow, the same
        number the dashboard and the statement show (cashflow_basis).
      * `committed_recurring_this_month` -- detected recurring obligations in
        committed categories only (rent, EMIs, utilities, subscriptions,
        education, SIPs; not habits like dining/shopping and not the card
        bill) at a monthly-equivalent run-rate (app.analytics.cashflow_basis),
        summed. This represents cash
        already earmarked for rent/EMI/subscriptions/etc. regardless of
        whether its exact due date has occurred yet this month -- it is a
        planning number, not a ledger of what's already left the account.
      * `discretionary_spend_so_far_this_month` -- actual outflow
        transactions dated in the current calendar month that are NOT
        payments to a committed merchant (so nothing is counted twice) and
        are not transfers/CC-bill-payments (see
        `_EXCLUDED_FROM_SPEND`) -- i.e. the spend that competes with
        "safe to spend today" money, as opposed to money already
        earmarked/committed.
      * `days_remaining_in_current_month` -- inclusive of today, so the
        number spreads today's opportunity across today and the days after.
      * Floored at 0 -- never tells the user to "spend" a negative amount.
    """
    today = datetime.now(timezone.utc).date()

    txn_rows = store.query(TransactionRow, user_id=user_id)

    df = _transactions_df(list(txn_rows))
    recurring_all = detect_recurring(df)

    monthly_income = _monthly_income(df, recurring_all)
    committed_recurring = committed_monthly(recurring_all)  # rent, EMIs, utilities, subscriptions, education, SIPs only
    committed_names = committed_merchants(recurring_all)

    if df.empty:
        discretionary_spent = 0.0
    else:
        discretionary = df[
            (df["amount"] < 0)
            & (df["date"].dt.year == today.year)
            & (df["date"].dt.month == today.month)
            & (~df["merchant"].map(normalize_merchant).isin(committed_names))  # committed payments are not spend twice
            & (~df["category"].isin(_EXCLUDED_FROM_SPEND))
        ]
        discretionary_spent = float(-discretionary["amount"].sum())

    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_remaining = max(1, days_in_month - today.day + 1)

    left = monthly_income - committed_recurring - discretionary_spent
    amount = max(0.0, left / days_remaining)
    shortfall = max(0.0, -left)
    # Never a "good" state at zero: nothing safe left (or committed payments above income) is a warning.
    if amount <= 0:
        status = "none"
    elif amount < 0.5 * max(0.0, monthly_income - committed_recurring) / days_in_month:
        status = "tight"
    else:
        status = "ok"

    basis = (
        f"(monthly income ₹{monthly_income:,.0f} - committed recurring "
        f"₹{committed_recurring:,.0f}/mo - discretionary spend so far this month "
        f"₹{discretionary_spent:,.0f}) / {days_remaining} day(s) left in "
        f"{today.strftime('%B %Y')}, floored at 0."
    )

    return SafeToSpend(amount=round(amount, 2), basis=basis, as_of_date=today, status=status, shortfall=round(shortfall, 2))
