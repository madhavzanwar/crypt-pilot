"""QA-5: safe-to-spend uses confirmed obligations only and never exceeds total spend; dashboard/budgets/plan share one basis."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.analytics.basis import committed_monthly, committed_obligations
from app.ingest.seed import seed_all
from app.main import app
from app.schemas import RecurrenceFrequency, RecurringObligation, TxnCategory
from datetime import date

seed_all()
client = TestClient(app, raise_server_exceptions=False)


def _ob(merchant, category, amount, freq="monthly", conf=0.9):
    return RecurringObligation(group_id=f"rg-{merchant}", merchant=merchant, category=category, amount=amount,
                               frequency=RecurrenceFrequency(freq), next_expected_date=date(2026, 12, 1), confidence=conf)


def test_committed_excludes_card_bills_low_confidence_and_everyday_merchants():
    rec = [
        _ob("rent", TxnCategory.rent_housing, -20000), _ob("hdfc emi", TxnCategory.emi_loan, -10000),
        _ob("card bill", TxnCategory.credit_card_payment, -15000),          # a transfer, not new spend
        _ob("uber", TxnCategory.transport, -450, "weekly", 0.05),            # one-off pattern
        _ob("myntra", TxnCategory.shopping, -1500, "monthly", 0.05),
        _ob("pharmeasy", TxnCategory.healthcare, -500, "monthly", 0.05),
        _ob("shaky sub", TxnCategory.subscriptions, -300, "monthly", 0.3),   # below the confidence threshold
        _ob("salary", TxnCategory.income, 90000),
        _ob("netflix", TxnCategory.subscriptions, -650),
    ]
    assert {r.merchant for r in committed_obligations(rec)} == {"rent", "hdfc emi", "netflix"}
    assert committed_monthly(rec) == 30650
    assert committed_monthly(rec, monthly_expenses=12000) == 12000  # never above total spend


@pytest.mark.parametrize("persona", ["priya", "arjun", "meera"])
def test_personas_share_one_basis_and_committed_is_below_spend(persona):
    uid = f"demo-{persona}"
    sts = client.get(f"/api/budgets/{uid}/safe-to-spend").json()
    dash = client.get(f"/api/dashboard/{uid}").json()
    assert sts["monthly_income"] == pytest.approx(dash["monthly_income"], abs=1)
    assert sts["committed_monthly"] == pytest.approx(dash["committed_monthly"], abs=1)
    assert 0 < sts["committed_monthly"] <= dash["monthly_expenses"]
    assert "credit card" not in sts["basis"].lower()
    assert sts["amount"] >= 0 and sts["status"] in {"ok", "over", "no_income"}
    plan = client.get(f"/api/plan/{uid}")
    if plan.status_code == 200:
        assert plan.json()["basis"]["income"] == pytest.approx(dash["monthly_income"], abs=1)
        assert plan.json()["basis"]["committed"] == pytest.approx(dash["committed_monthly"], abs=1)


def test_priya_and_arjun_have_money_left_to_spend():
    for persona in ("priya", "arjun"):
        sts = client.get(f"/api/budgets/demo-{persona}/safe-to-spend").json()
        assert sts["amount"] > 0 and sts["status"] == "ok"
