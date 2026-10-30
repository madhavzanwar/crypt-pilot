"""QA fix pass A, item 1: absurd dates/amounts are rejected, "this month" comes from today, what-if events and demo
threats never touch the shared demo ledger."""
from __future__ import annotations

import io
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core import store
from app.core.auth import resolve_user_id
from app.ingest.seed import seed_all
from app.ingest.snapshot import build_dashboard_snapshot
from app.main import app
from app.models import TransactionRow

GUEST = "guest-qaaledger0001"


@pytest.fixture(scope="module", autouse=True)
def _seed():
    seed_all()


@pytest.fixture()
def client():
    app.dependency_overrides[resolve_user_id] = lambda user_id: user_id
    yield TestClient(app)
    app.dependency_overrides.clear()


def _ledger_count(uid):
    return len(store.query(TransactionRow, user_id=uid))


@pytest.mark.parametrize("body,needle", [
    ({"kind": "transaction", "amount": -1000, "merchant": "Far", "date": "2099-01-01"}, "date"),
    ({"kind": "transaction", "amount": -1000, "merchant": "Old", "date": "1999-12-31"}, "date"),
    ({"kind": "transaction", "amount": -9_999_999_999, "merchant": "Huge"}, "amount"),
    ({"kind": "recurring", "amount": 99_999_999_999, "merchant": "Huge", "frequency": "monthly"}, "amount"),
    ({"kind": "recurring", "amount": 100, "merchant": "Far", "next_expected_date": "2099-01-01"}, "next_expected_date"),
])
def test_events_reject_absurd_values_with_clear_422(client, body, needle):
    r = client.post("/api/events/demo-priya", json=body)
    assert r.status_code == 422
    assert needle in r.json()["detail"] if isinstance(r.json()["detail"], str) else needle in str(r.json())


def test_saved_entry_cannot_be_dated_far_ahead(client):
    ahead = (date.today() + timedelta(days=60)).isoformat()
    r = client.post(f"/api/events/{GUEST}", json={"kind": "transaction", "amount": -10, "merchant": "Later", "date": ahead, "simulate": False})
    assert r.status_code == 422 and "too far" in r.text


def test_timeline_event_on_demo_persona_is_a_what_if_and_not_saved(client):
    before_rows, before_snap = _ledger_count("demo-priya"), build_dashboard_snapshot("demo-priya")
    ahead = (date.today() + timedelta(days=90)).isoformat()
    r = client.post("/api/events/demo-priya", json={"kind": "transaction", "amount": -50000, "merchant": "Big what-if", "date": ahead})
    assert r.status_code == 200 and r.json()["simulated"] is True
    assert "nothing was saved" in r.json()["narrative"]
    assert _ledger_count("demo-priya") == before_rows
    assert build_dashboard_snapshot("demo-priya").monthly_expenses == before_snap.monthly_expenses
    # the what-if baseline is the real current health score, not a stale cached one
    assert r.json()["health_score_before"] == before_snap.health_score.overall
    assert client.get("/api/transactions/demo-priya", params={"search": "Big what-if"}).json()["total"] == 0


def test_far_future_row_does_not_move_this_month(client):
    """Even a legacy bad row (dated 2099) must not become the anchor of the dashboard's trailing window."""
    base = build_dashboard_snapshot("demo-priya")
    row = TransactionRow(id="qa-a-future-row", user_id="demo-priya", account_id="acc-events-demo-priya", date=date(2099, 1, 1),
                         amount=-1000, merchant="Far", category="shopping")
    store.put(row)
    try:
        after = build_dashboard_snapshot("demo-priya")
        assert after.monthly_income == pytest.approx(base.monthly_income)
        assert after.monthly_expenses == pytest.approx(base.monthly_expenses)
        assert after.savings_rate == pytest.approx(base.savings_rate)
        assert client.get("/api/forecast-risk/demo-priya").status_code == 200
    finally:
        store.delete(TransactionRow, "qa-a-future-row")


def test_demo_threats_are_idempotent_tagged_removable_and_off_the_ledger(client):
    before_rows, before_snap = _ledger_count("demo-arjun"), build_dashboard_snapshot("demo-arjun")
    assert client.post("/api/security/demo-arjun/demo-threats").json()["planted"] == 9
    assert client.post("/api/security/demo-arjun/demo-threats").json()["planted"] == 9
    bucket = store.query(TransactionRow, user_id="threat::demo-arjun")
    assert len(bucket) == 9 and all("demo-threat" in (r.tags or "") for r in bucket)
    assert _ledger_count("demo-arjun") == before_rows
    after = build_dashboard_snapshot("demo-arjun")
    assert after.monthly_expenses == before_snap.monthly_expenses and after.health_score.overall == before_snap.health_score.overall
    from app.security import agents
    found = [f for fs in agents.run_checks(agents.security_rows("demo-arjun"), []).values() for f in fs]
    assert found, "the security agents still see the planted threats"
    assert client.delete("/api/security/demo-arjun/demo-threats").json()["removed"] == 9
    assert store.query(TransactionRow, user_id="threat::demo-arjun") == []


def test_csv_upload_rejects_far_future_and_huge_rows(client):
    csv = b"date,description,amount\n2099-01-01,Far,-100\n"
    r = client.post(f"/api/upload/{GUEST}", files={"file": ("a.csv", io.BytesIO(csv), "text/csv")})
    assert r.status_code == 400 and "not usable" in r.text
    csv = b"date,description,amount\n2026-01-01,Huge,-99999999999\n"
    r = client.post(f"/api/upload/{GUEST}", files={"file": ("a.csv", io.BytesIO(csv), "text/csv")})
    assert r.status_code == 400 and "too large" in r.text


def test_ocr_import_validates(client):
    r = client.post(f"/api/ocr/import/{GUEST}", json={"transactions": [{"date": "2099-01-01", "description": "x", "amount": -5}]})
    assert r.status_code == 422
    r = client.post(f"/api/ocr/import/{GUEST}", json={"transactions": [{"date": "2026-01-01", "description": "x", "amount": -5e9}]})
    assert r.status_code == 422
