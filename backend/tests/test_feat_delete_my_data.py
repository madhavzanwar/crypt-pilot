"""POST /api/my-data/{user_id}/delete: irreversible erase of one user's data across every collection."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.my_data_router import _user_tables
from app.core import store
from app.main import app
from app.models import (
    AuditLogRow, ConnectionRow, EventRow, HouseholdInviteRow, HouseholdMemberRow, HouseholdRow, PairRow, PayLimitRow, PaymentReviewRow,
    PriceMemoryRow, SettlementRow, SharedExpenseRow, TransactionRow,
)

client = TestClient(app)
OK = {"confirm": "DELETE MY DATA"}


def _guest() -> str:
    return "guest-" + uuid.uuid4().hex[:12]


def _populate(u: str) -> None:
    """Real API calls first, then rows no public endpoint makes without side effects."""
    assert client.post(f"/api/expenses/{u}", data={"item": "tea", "amount": 15}).status_code in (200, 201)
    assert client.post(f"/api/goals/{u}", json={"name": "Trip", "target_amount": 50000}).status_code == 200
    assert client.post(f"/api/budgets/{u}", json={"category": "dining", "monthly_limit": 4000}).status_code == 200
    assert client.post(f"/api/rules/{u}", json={"pattern": "zomato", "category": "dining"}).status_code == 200
    assert client.put(f"/api/profile/{u}", json={"level": "skipped", "answers": {}}).status_code == 200
    assert client.post(f"/api/household/{u}", json={"name": "Mine"}).status_code == 200
    assert client.post(f"/api/household/{u}/managed-members", json={"name": "Kiddo", "opening_balance": 100}).status_code == 200
    assert client.post(f"/api/household/{u}/invites", json={"email": "a@b.co", "role": "viewer"}).status_code == 200
    s = client.get(f"/api/household/{u}/shared-expenses").json()
    kid = next(m["id"] for m in s["members"] if m["kind"] == "managed")
    assert client.post(f"/api/household/{u}/shared-expenses", json={"title": "Pizza", "amount": 300, "paid_by": u}).status_code == 201
    assert client.post(f"/api/household/{u}/settlements", json={"from": kid, "to": u, "amount": 10}).status_code == 201
    store.put(
        PayLimitRow(id=u, user_id=u, per_payment=500), PairRow(id="pair-" + u, user_id=u),
        PaymentReviewRow(id="rev-" + u, user_id=u, payee_name="x", amount=5, verdict="secure"),
        PriceMemoryRow(user_id=u, item="tea", price=15), EventRow(user_id=u, kind="manual", payload_json="{}"), ConnectionRow(id=f"{u}:google_pay", user_id=u, connector="google_pay"),
        AuditLogRow(user_id=u, event_type="data_access", method="GET", path="/x", status_code=200),
    )


def _remaining(u: str) -> dict[str, int]:
    out = {m.__tablename__: len(store.query(m, user_id=u)) for m in _user_tables()}
    return {k: v for k, v in out.items() if v}


def test_demo_personas_are_never_deletable():
    for uid in ("demo-priya", "demo-arjun", "demo-meera"):
        r = client.post(f"/api/my-data/{uid}/delete", json=OK)
        assert r.status_code == 403 and "Demo data is shared" in r.json()["detail"]
    assert client.get("/api/household/demo-priya").status_code == 200


@pytest.mark.parametrize("body", [{"confirm": "delete my data"}, {"confirm": ""}, {"confirm": "DELETE MY DATA "}, {}, {"confirm": "DELETE MY DATA", "x": 1}])
def test_wrong_confirmation_is_rejected_and_nothing_is_deleted(body):
    u = _guest()
    client.post(f"/api/goals/{u}", json={"name": "Trip", "target_amount": 50000})
    r = client.post(f"/api/my-data/{u}/delete", json=body)
    assert r.status_code in (400, 422)
    assert _remaining(u).get("goals") == 1


def test_non_guest_needs_authentication():
    assert client.post("/api/my-data/real-user-1/delete", json=OK).status_code == 401


def test_guest_delete_wipes_every_collection_and_is_idempotent():
    u = _guest()
    _populate(u)
    before = _remaining(u)
    assert {"accounts", "transactions", "goals", "budgets", "categorization_rules", "profiles", "household_members", "pay_limits", "pay_pairs",
            "payment_reviews", "price_memory", "connections", "audit_logs", "events"} <= set(before)
    hh = store.first(HouseholdMemberRow, user_id=u).household_id
    managed = [m.user_id for m in store.query(HouseholdMemberRow, household_id=hh) if m.is_managed]

    r = client.post(f"/api/my-data/{u}/delete", json=OK)
    assert r.status_code == 200, r.text
    body = r.json()
    d = body["deleted"]
    assert body["total"] == sum(d.values()) > 0 and all(v > 0 for v in d.values())
    assert d["households"] == 1 and d["household_invites"] == 1 and d["shared_expenses"] == 1 and d["settlements"] == 1
    assert d["household_members"] == 2 and d["accounts"] >= 2  # owner + managed member wallet
    assert body["kept"] and body["at"]

    assert _remaining(u) == {}
    assert store.get(HouseholdRow, hh) is None
    assert not store.query(HouseholdInviteRow, household_id=hh) and not store.query(SharedExpenseRow, household_id=hh)
    assert not store.query(SettlementRow, household_id=hh)
    for m in managed:
        assert not store.query(TransactionRow, user_id=m)
    assert client.get(f"/api/household/{u}/shared-expenses").json() is None

    again = client.post(f"/api/my-data/{u}/delete", json=OK).json()
    assert again["total"] == 0 and again["deleted"] == {}


def test_deleting_one_guest_never_touches_another_guest_or_the_demo_personas():
    a, b = _guest(), _guest()
    _populate(a)
    _populate(b)
    keep_b = _remaining(b)
    demo_before = {u: len(store.query(TransactionRow, user_id=u)) for u in ("demo-priya", "demo-arjun", "demo-meera")}
    assert client.get("/api/household/demo-priya").status_code == 200
    assert client.post(f"/api/my-data/{a}/delete", json=OK).json()["total"] > 0
    assert _remaining(b) == keep_b
    assert client.get(f"/api/household/{b}").status_code == 200
    assert {u: len(store.query(TransactionRow, user_id=u)) for u in demo_before} == demo_before
    assert client.get("/api/household/demo-priya").status_code == 200
    assert len(client.get("/api/household/demo-priya/shared-expenses").json()["expenses"]) > 0


def test_non_owner_leaves_household_which_survives_for_the_owner():
    owner, other = _guest(), _guest()
    client.post(f"/api/household/{owner}", json={"name": "Hh"})
    hh = store.first(HouseholdMemberRow, user_id=owner).household_id
    store.put(HouseholdMemberRow(household_id=hh, user_id=other, role="editor"))
    client.post(f"/api/household/{owner}/shared-expenses", json={"title": "Rent", "amount": 100, "paid_by": owner})
    r = client.post(f"/api/my-data/{other}/delete", json=OK).json()
    assert r["deleted"] == {"household_members": 1}
    assert store.get(HouseholdRow, hh) is not None and len(store.query(SharedExpenseRow, household_id=hh)) == 1
    s = client.get(f"/api/household/{owner}/shared-expenses").json()
    assert [m["id"] for m in s["members"]] == [owner]
    assert client.post(f"/api/my-data/{owner}/delete", json=OK).json()["deleted"]["households"] == 1


def test_sole_owner_delete_removes_household_for_other_members_too():
    owner, other = _guest(), _guest()
    client.post(f"/api/household/{owner}", json={"name": "Hh"})
    hh = store.first(HouseholdMemberRow, user_id=owner).household_id
    store.put(HouseholdMemberRow(household_id=hh, user_id=other, role="viewer"))
    client.post(f"/api/my-data/{owner}/delete", json=OK)
    assert store.get(HouseholdRow, hh) is None and not store.query(HouseholdMemberRow, household_id=hh)
    assert client.get(f"/api/household/{other}/shared-expenses").json() is None


def test_every_user_owned_model_is_covered_by_the_sweep():
    names = {m.__tablename__ for m in _user_tables()}
    assert {"accounts", "transactions", "goals", "budgets", "profiles", "pay_pairs", "connections", "documents", "investigations",
            "copilot_insights", "insights_snapshots", "price_memory", "payment_reviews", "pay_limits", "debts", "incomes", "events",
            "categorization_rules", "household_members", "audit_logs"} <= names
    assert "shared_expenses" not in names  # household-owned, removed with the household


def test_audit_receipt_has_counts_but_no_user_id():
    u = _guest()
    client.post(f"/api/goals/{u}", json={"name": "Trip", "target_amount": 50000})
    client.post(f"/api/my-data/{u}/delete", json=OK)
    receipts = [r for r in store.query(AuditLogRow, event_type="data_deleted")]
    assert receipts and all(r.user_id is None and u not in r.detail and u not in r.path for r in receipts)
    assert not store.query(AuditLogRow, user_id=u)  # the middleware leaves no per-request trace either
