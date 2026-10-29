"""BUG-021 / BUG-022: statement text, recurring dates, and one source for income / committed recurring."""
from __future__ import annotations

import re
from datetime import date, timedelta

import pandas as pd
from fastapi.testclient import TestClient

from app.analytics import cashflow_basis as cb
from app.analytics.recurring import detect_recurring
from app.api import budgets_router
from app.main import app
from app.schemas import RecurrenceFrequency, RecurringObligation, TxnCategory

client = TestClient(app)
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def _df(rows):
    return pd.DataFrame(rows, columns=["date", "amount", "merchant", "category"]).assign(account_id="a", is_recurring=False)


def test_recurring_next_date_is_never_in_the_past():
    last = date.today() - timedelta(days=50)
    rows = [(last - timedelta(days=30 * i), -499.0, "Gym Club", "subscriptions") for i in range(4)]
    r = detect_recurring(_df(rows))[0]
    assert r.next_expected_date >= date.today()
    assert (r.next_expected_date - last).days % 30 == 0  # rolled forward by whole intervals
    # an explicit as_of keeps the old behaviour for historical analysis
    old = detect_recurring(_df(rows), as_of=last)[0]
    assert old.next_expected_date == last + timedelta(days=30)


def _ob(cat, amount, freq=RecurrenceFrequency.monthly, merchant="m"):
    return RecurringObligation(group_id=f"rg-{merchant}", merchant=merchant, category=cat, amount=amount, frequency=freq,
                               next_expected_date=date.today(), confidence=0.9)


def test_committed_counts_commitments_not_habits_or_card_bills():
    items = [
        _ob(TxnCategory.rent_housing, -30000, merchant="rent"), _ob(TxnCategory.emi_loan, -10000, merchant="emi"),
        _ob(TxnCategory.dining, -600, RecurrenceFrequency.weekly, merchant="zomato"),
        _ob(TxnCategory.groceries, -1400, RecurrenceFrequency.weekly, merchant="dmart"),
        _ob(TxnCategory.credit_card_payment, -15000, merchant="card"), _ob(TxnCategory.income, 90000, merchant="pay"),
        _ob(TxnCategory.subscriptions, -900, RecurrenceFrequency.irregular, merchant="odd"),
    ]
    assert cb.committed_monthly(items) == 40000


def test_budgets_and_dashboard_share_one_income_figure_and_commitments_stay_below_it():
    for uid in ("demo-priya", "demo-arjun"):
        dash = client.get(f"/api/dashboard/{uid}").json()
        sts = client.get(f"/api/budgets/{uid}/safe-to-spend").json()
        assert f"monthly income ₹{dash['monthly_income']:,.0f}" in sts["basis"]
        committed = float(re.search(r"committed recurring ₹([\d,]+)/mo", sts["basis"]).group(1).replace(",", ""))
        assert committed < dash["monthly_income"]


def test_zero_safe_to_spend_is_never_an_ok_state():
    from app.core import store
    from app.models import AccountRow, TransactionRow

    uid = "guest-r2sts0000001"
    acc = AccountRow(user_id=uid, name="Main", type="checking", balance=1000)
    today = date.today()
    rows = []
    for i in range(4):  # income 10k a month, rent 20k a month: commitments exceed income whatever the day of the month
        d = today - timedelta(days=30 * i + 1)
        rows.append(TransactionRow(user_id=uid, account_id=acc.id, date=d, amount=10000, merchant="Payroll", category="income"))
        rows.append(TransactionRow(user_id=uid, account_id=acc.id, date=d, amount=-20000, merchant="Landlord", category="rent_housing"))
    store.put(acc, *rows)
    try:
        sts = client.get(f"/api/budgets/{uid}/safe-to-spend").json()
        assert sts["amount"] == 0 and sts["status"] == "none" and sts["shortfall"] > 0
    finally:
        from app.ingest.seed import _clear_user
        _clear_user(uid)


def test_recommendation_text_has_no_ids_lists_or_ungrouped_amounts():
    dash = client.get("/api/dashboard/demo-priya").json()
    recs = dash["insights"]["recommendations"]
    assert recs
    for rec in recs:
        text = rec["text"]
        assert not UUID.search(text) and "[" not in text and "rg-" not in text and "'" not in text, text
        assert not re.search(r"\d{4,}", text.replace("₹", "")) or "," in text, text  # amounts of 1000+ are grouped
    assert any("Cancel" in r["text"] and "Cult" in r["text"] for r in recs) or any("Cancel" in r["text"] for r in recs)


def test_debts_carry_account_names_and_snapshot_has_a_period():
    dash = client.get("/api/dashboard/demo-priya").json()
    assert dash["debts"] and all(d["name"] and not UUID.search(d["name"]) for d in dash["debts"])
    assert re.fullmatch(r"\d{4}-\d{2}", dash["period"]) and dash["period_start"] < dash["period_end"]
    assert dash["period"] == dash["period_end"][:7]
    assert all(r["next_expected_date"] >= date.today().isoformat() for r in dash["recurring_obligations"])


def test_inr_uses_indian_grouping():
    from app.recommend.engine import _inr

    assert _inr(9833) == "₹9,833" and _inr(123456) == "₹1,23,456" and _inr(12) == "₹12" and _inr(1000000) == "₹10,00,000"
