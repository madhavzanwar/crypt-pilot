"""GET /api/plan/{user_id}/readiness: same month rule as the plan, without running the forecast."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api import plan_router
from app.core import store
from app.ingest.seed import seed_all
from app.main import app
from app.models import TransactionRow

client = TestClient(app)


def setup_module():
    seed_all()


def _month_start(back: int) -> date:
    d = date.today().replace(day=1)
    for _ in range(back):
        d = (d - timedelta(days=1)).replace(day=1)
    return d


def test_guest_with_no_data():
    r = client.get("/api/plan/guest-readiness0000/readiness")
    assert r.status_code == 200
    assert r.json() == {"ready": False, "months_available": 0, "months_needed": 4}


def test_demo_persona_is_ready():
    r = client.get("/api/plan/demo-priya/readiness")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True and body["months_available"] >= body["months_needed"] == 4
    assert client.get("/api/plan/demo-priya").status_code == 200


def test_readiness_does_not_run_the_forecast(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("forecast must not run")

    monkeypatch.setattr(plan_router, "fit_forecaster", boom)
    monkeypatch.setattr(plan_router, "plan", boom)
    assert client.get("/api/plan/demo-arjun/readiness").status_code == 200


def _seed_guest(uid: str, months: int):
    """`months` complete months (month 1 starts on the 1st) of salary + rent + groceries + dining."""
    rows = []
    for back in range(1, months + 1):
        m = _month_start(back)
        for day, amt, merch, cat in [(1, 80000, "Salary", "income"), (2, -20000, "Rent", "rent_housing"),
                                     (5, -6000, "Grocer", "groceries"), (9, -4000, "Cafe", "dining")]:
            rows.append(TransactionRow(user_id=uid, account_id=f"{uid}-acc", date=m.replace(day=day), amount=amt, merchant=merch, category=cat))
    store.put(*rows)


@pytest.mark.parametrize("months", [2, 4, 5])
def test_guest_with_n_months(months):
    uid = f"guest-{months}0a0b0c0d0e0f0{months}"
    _seed_guest(uid, months)
    body = client.get(f"/api/plan/{uid}/readiness").json()
    assert body["months_available"] == months
    assert body["ready"] is (months >= 4)
    plan = client.get(f"/api/plan/{uid}")
    assert (plan.status_code == 200) is body["ready"]
    if not body["ready"]:
        assert plan.status_code == 422
