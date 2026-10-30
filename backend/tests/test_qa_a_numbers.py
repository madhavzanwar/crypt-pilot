"""QA2-4/5/8, QA3-3: no negative interest or subscription amounts; one income/expense basis; no salary-straddle months."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import pytest

from app.analytics.basis import pay_month, trailing_income_expenses
from app.analytics.savings import trailing_savings_rate
from app.plan.history import monthly_flows
from app.security import agents
from app.simulate.amortization import amortize


def test_prepay_more_than_balance_never_gives_negative_interest():
    r = amortize(18_500, 42.0, 1_500, 20_000)
    assert r.total_interest >= 0 and r.months_to_payoff == 1
    assert amortize(300_000, 9.5, 8_000, 10_000).total_interest > 0
    with pytest.raises(ValueError):
        amortize(1000, 10, 100, -5)


def test_prepay_endpoint_rejects_negative_extra(client=None):
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    snap = c.get("/api/dashboard/demo-priya").json()
    debt = snap["debts"][0]["id"]
    ok = c.post("/api/simulate/demo-priya", json={"action": "prepay_debt", "action_params": {"debt_id": debt, "extra_payment": 20000}})
    assert ok.status_code == 200 and ok.json()["impact"]["after"] >= 0
    bad = c.post("/api/simulate/demo-priya", json={"action": "prepay_debt", "action_params": {"debt_id": debt, "extra_payment": -5}})
    assert bad.status_code == 400


def test_what_if_free_cash_flow_uses_dashboard_basis():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    snap = c.get("/api/dashboard/demo-priya").json()
    gid = snap["recurring_obligations"][0]["group_id"]
    r = c.post("/api/simulate/demo-priya", json={"action": "cancel_subscription", "action_params": {"group_id": gid}}).json()
    base = snap["monthly_income"] - snap["monthly_expenses"]
    assert abs(r["impact"]["before"] - base) < 1
    assert r["impact"]["after"] >= r["impact"]["before"]


def _rows(dates, amount=100_000, cat="income"):
    return pd.DataFrame({"date": pd.to_datetime(dates), "amount": amount, "category": cat, "merchant": "Pay"})


def test_late_salary_belongs_to_next_month():
    s = pay_month(_rows(["2026-01-31", "2026-02-28", "2026-03-03", "2026-04-01"]))
    assert [str(p) for p in s] == ["2026-02", "2026-03", "2026-03", "2026-04"][:1] + ["2026-03", "2026-03", "2026-04"]


def test_trailing_income_counts_three_salaries_whatever_the_jitter():
    today = date.today()
    pays = [today - timedelta(days=d) for d in (1, 33, 62)]  # three salaries, window edges irrelevant
    exp = pd.DataFrame({"date": pd.to_datetime([today - timedelta(days=5)]), "amount": -3000.0, "category": "dining", "merchant": "x"})
    df = pd.concat([_rows(pays), exp])
    inc, out = trailing_income_expenses(df, 3)
    assert inc == pytest.approx(300_000) and out == pytest.approx(3000)
    assert trailing_savings_rate(df, 3) == pytest.approx((300_000 - 3000) / 300_000)


def test_future_rows_are_ignored_by_the_basis():
    today = date.today()
    df = pd.concat([_rows([today - timedelta(days=2)]), _rows([date(2099, 1, 1)], amount=5_000_000)])
    inc, _ = trailing_income_expenses(df, 3)
    assert inc == pytest.approx(100_000)


def test_monthly_flows_has_no_zero_or_double_salary_months():
    dates = ["2025-08-03", "2025-09-02", "2025-09-30", "2025-10-31", "2025-12-02", "2026-01-01", "2026-01-30", "2026-03-02",
             "2026-04-03"]  # pay-months: Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr
    df = _rows(dates)
    exp = pd.DataFrame({"date": pd.to_datetime(["2025-08-10"]), "amount": -10.0, "category": "dining", "merchant": "x"})
    flows = monthly_flows(pd.concat([df, exp]))
    assert (flows["income"] == 100_000).all(), flows


def test_overlapping_subscription_finding_is_positive():
    from app.models import TransactionRow
    today = date.today()
    rows = []
    for m in ("Netflix", "Amazon Prime Video"):
        for i in range(4):
            rows.append(TransactionRow(user_id="u", account_id="a", date=today - timedelta(days=30 * i + 3), amount=-499.0 if m == "Netflix" else -299.0,
                                       merchant=m, category="subscriptions", is_recurring=True))
    out = agents.subscription_sleuth(rows, [])
    over = [f for f in out if f["title"].startswith("Overlapping")]
    assert over and all(f["amount"] > 0 and "₹-" not in f["detail"] for f in over)
