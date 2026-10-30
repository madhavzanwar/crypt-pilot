"""Shared household expenses ("Who owes who"): money math, validation, roles, sample data."""
import json
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.household_shared_router import compute_balances, split_paise, suggest_transfers, to_paise
from app.core import store
from app.main import app
from app.models import HouseholdMemberRow, SharedExpenseRow

client = TestClient(app)


def _guest() -> str:
    return "guest-" + uuid.uuid4().hex[:12]


@pytest.fixture
def hh():
    """A guest-owned household with one managed member (Kiddo) and one extra real member (editor)."""
    owner, friend = _guest(), _guest()
    client.post(f"/api/household/{owner}", json={"name": "Flat"})
    client.post(f"/api/household/{owner}/managed-members", json={"name": "Kiddo"})
    hid = store.first(HouseholdMemberRow, user_id=owner).household_id
    store.put(HouseholdMemberRow(household_id=hid, user_id=friend, role="editor"))
    kid = next(m.user_id for m in store.query(HouseholdMemberRow, household_id=hid) if m.is_managed)
    return {"owner": owner, "friend": friend, "kid": kid, "id": hid}


def _add(u, **kw):
    return client.post(f"/api/household/{u}/shared-expenses", json={"title": "Dinner", **kw})


def _net(summary):
    return {b["member_id"]: b["net"] for b in summary["balances"]}


# --- pure math -------------------------------------------------------------------------------------------------------

def test_to_paise_rounds_half_up():
    assert [to_paise(x) for x in (10, 0.1, 0.005, 1.005, 33.335, 2150.5)] == [1000, 10, 1, 101, 3334, 215050]


def test_equal_split_distributes_remainder_exactly_and_deterministically():
    s = split_paise(100, ["c", "a", "b"], "exp-1")
    assert sum(s.values()) == 100 and sorted(s.values()) == [33, 33, 34]
    assert s == split_paise(100, ["a", "b", "c"], "exp-1")
    assert sum(split_paise(1, ["a", "b", "c"], "x").values()) == 1
    assert sorted(split_paise(1000, ["a", "b", "c", "d"], "x").values()) == [250] * 4


def test_balances_sum_to_zero_and_transfers_settle_everything():
    members = ["a", "b", "c", "d"]
    exps = [("e1", 100_00, "a", members), ("e2", 33_33, "b", ["b", "c"]), ("e3", 1, "c", members), ("e4", 77_77, "d", ["a", "d"])]
    book = compute_balances(members, exps, [("b", "a", 5_00)])
    nets = {m: book[m]["net"] for m in members}
    assert sum(nets.values()) == 0
    after = dict(nets)
    for frm, to, p in suggest_transfers(nets):
        assert p > 0 and frm != to
        after[frm] += p
        after[to] -= p
    assert set(after.values()) == {0}
    assert len(suggest_transfers(nets)) <= len(members) - 1


def test_no_transfers_when_even():
    assert suggest_transfers({"a": 0, "b": 0}) == []


# --- API -------------------------------------------------------------------------------------------------------------

def test_get_is_null_without_household():
    assert client.get(f"/api/household/{_guest()}/shared-expenses").json() is None
    assert client.get("/api/household/demo-meera/shared-expenses").json() is None


def test_empty_summary_shape(hh):
    s = client.get(f"/api/household/{hh['owner']}/shared-expenses").json()
    assert s["household_id"] == hh["id"] and s["sample"] is False and s["read_only"] is False
    assert {m["kind"] for m in s["members"]} == {"user", "managed"} and len(s["members"]) == 3
    assert s["expenses"] == [] and s["settlements"] == [] and s["transfers"] == []
    assert all(b["net"] == 0 for b in s["balances"])


def test_equal_split_with_remainder(hh):
    o = hh["owner"]
    r = _add(o, amount=100, paid_by=o)  # 3 members: 33.33/33.33/33.34
    assert r.status_code == 201
    s = r.json()
    assert s["expenses"][0]["amount"] == 100 and sorted(s["expenses"][0]["split_among"]) == sorted([o, hh["friend"], hh["kid"]])
    owed = sorted(b["owed"] for b in s["balances"])
    assert owed == [33.33, 33.33, 33.34] and round(sum(owed), 2) == 100
    assert round(sum(b["net"] for b in s["balances"]), 2) == 0
    assert _net(s)[o] == pytest.approx(100 - next(b["owed"] for b in s["balances"] if b["member_id"] == o))
    assert {(t["to"], round(t["amount"], 2)) for t in s["transfers"]} == {(o, t["amount"]) for t in s["transfers"]}
    assert round(sum(t["amount"] for t in s["transfers"]), 2) == round(_net(s)[o], 2)


def test_custom_subset_split(hh):
    o, f = hh["owner"], hh["friend"]
    s = _add(o, amount=90, paid_by=o, split_among=[o, f]).json()
    n = _net(s)
    assert n[o] == 45 and n[f] == -45 and n[hh["kid"]] == 0
    assert s["transfers"] == [{"from": f, "to": o, "amount": 45}]


def test_settlements_zero_out_balances(hh):
    o, f, k = hh["owner"], hh["friend"], hh["kid"]
    _add(o, amount=300, paid_by=o)
    s = client.post(f"/api/household/{o}/settlements", json={"from": f, "to": o, "amount": 100, "note": " cash "})
    assert s.status_code == 201 and s.json()["settlements"][0]["note"] == "cash"
    s = client.post(f"/api/household/{o}/settlements", json={"from": k, "to": o, "amount": 100}).json()
    assert all(b["net"] == 0 for b in s["balances"]) and s["transfers"] == []


def test_partial_settlement_leaves_remaining_transfer(hh):
    o, f = hh["owner"], hh["friend"]
    _add(o, amount=300, paid_by=o)
    s = client.post(f"/api/household/{o}/settlements", json={"from": f, "to": o, "amount": 40}).json()
    assert _net(s)[f] == -60 and {(t["from"], t["amount"]) for t in s["transfers"]} >= {(f, 60)}
    assert round(sum(b["net"] for b in s["balances"]), 2) == 0


def test_multiple_expenses_sum_of_nets_zero_and_transfers_balance(hh):
    o, f, k = hh["owner"], hh["friend"], hh["kid"]
    _add(o, amount=1234.57, paid_by=f)
    _add(o, amount=0.07, paid_by=k, split_among=[o, f])
    s = _add(o, amount=999.99, paid_by=o).json()
    assert round(sum(b["net"] for b in s["balances"]), 2) == 0
    nets = {m: round(v * 100) for m, v in _net(s).items()}
    for t in s["transfers"]:
        nets[t["from"]] += round(t["amount"] * 100)
        nets[t["to"]] -= round(t["amount"] * 100)
    assert set(nets.values()) == {0}


def test_delete_expense(hh):
    o = hh["owner"]
    s = _add(o, amount=60, paid_by=o).json()
    eid = s["expenses"][0]["id"]
    d = client.delete(f"/api/household/{o}/shared-expenses/{eid}")
    assert d.status_code == 200 and d.json()["expenses"] == [] and all(b["net"] == 0 for b in d.json()["balances"])
    assert client.delete(f"/api/household/{o}/shared-expenses/{eid}").status_code == 404
    assert client.delete(f"/api/household/{o}/shared-expenses/nope").status_code == 404


def test_cannot_delete_an_expense_of_another_household(hh):
    other = _guest()
    client.post(f"/api/household/{other}", json={"name": "Other"})
    eid = _add(hh["owner"], amount=10, paid_by=hh["owner"]).json()["expenses"][0]["id"]
    assert client.delete(f"/api/household/{other}/shared-expenses/{eid}").status_code == 404


@pytest.mark.parametrize("patch", [
    {"amount": 0}, {"amount": -5}, {"amount": 1e9}, {"amount": 0.001}, {"title": ""}, {"title": "   "}, {"title": "x" * 121},
    {"paid_by": "stranger"}, {"split_among": []}, {"split_among": ["stranger"]}, {"date": "1999-12-31"},
    {"date": (date.today() + timedelta(days=5)).isoformat()}, {"date": "not-a-date"}, {"amount": "abc"}, {"amount": None},
])
def test_expense_validation_errors(hh, patch):
    assert _add(hh["owner"], **{"amount": 10, "paid_by": hh["owner"], **patch}).status_code == 422


def test_non_finite_amount_is_rejected(hh):
    r = client.post(f"/api/household/{hh['owner']}/shared-expenses", content='{"title":"x","amount":NaN,"paid_by":"%s"}' % hh["owner"],
                    headers={"content-type": "application/json"})
    assert r.status_code == 422


@pytest.mark.parametrize("body", [
    {"amount": 10}, {"from": "OWNER", "to": "OWNER", "amount": 10}, {"from": "OWNER", "to": "stranger", "amount": 10},
    {"from": "OWNER", "to": "FRIEND", "amount": 0}, {"from": "OWNER", "to": "FRIEND", "amount": -1},
])
def test_settlement_validation_errors(hh, body):
    body = json.loads(json.dumps(body).replace("OWNER", hh["owner"]).replace("FRIEND", hh["friend"]))
    assert client.post(f"/api/household/{hh['owner']}/settlements", json=body).status_code == 422


def test_date_defaults_to_today_and_accepts_tomorrow(hh):
    o = hh["owner"]
    assert _add(o, amount=5, paid_by=o).json()["expenses"][0]["date"] in {date.today().isoformat(), (date.today() - timedelta(days=1)).isoformat(), (date.today() + timedelta(days=1)).isoformat()}  # UTC vs local day
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert _add(o, amount=5, paid_by=o, date=tomorrow).status_code == 201


def test_viewer_cannot_write_but_can_read(hh):
    viewer = _guest()
    store.put(HouseholdMemberRow(household_id=hh["id"], user_id=viewer, role="viewer"))
    assert _add(viewer, amount=10, paid_by=viewer).status_code == 403
    assert client.post(f"/api/household/{viewer}/settlements", json={"from": viewer, "to": hh["owner"], "amount": 5}).status_code == 403
    eid = _add(hh["owner"], amount=10, paid_by=hh["owner"]).json()["expenses"][0]["id"]
    assert client.delete(f"/api/household/{viewer}/shared-expenses/{eid}").status_code == 403
    assert client.get(f"/api/household/{viewer}/shared-expenses").json()["read_only"] is False


def test_writes_without_household_are_404():
    u = _guest()
    assert _add(u, amount=5, paid_by=u).status_code == 404


def test_demo_personas_are_read_only_with_friendly_message():
    for uid in ("demo-priya", "demo-arjun", "demo-meera"):
        r = _add(uid, amount=10, paid_by="demo-priya")
        assert r.status_code == 403 and "shared sample data" in r.json()["detail"]
        assert client.post(f"/api/household/{uid}/settlements", json={"from": "demo-rishi", "to": "demo-priya", "amount": 1}).status_code == 403
        assert client.delete(f"/api/household/{uid}/shared-expenses/sample-exp-1").status_code == 403
    assert not store.query(SharedExpenseRow, household_id="hh-priya-family")


def test_demo_household_sample_is_generated_read_only_and_not_stored():
    s = client.get("/api/household/demo-priya/shared-expenses").json()
    assert s["sample"] is True and s["read_only"] is True and s["household_id"] == "hh-priya-family"
    assert [m["name"] for m in s["members"]] == ["Priya", "Rishi", "Swara", "Vedant"]
    assert len(s["expenses"]) >= 5 and s["settlements"] and s["transfers"]
    assert round(sum(b["net"] for b in s["balances"]), 2) == 0
    assert not store.query(SharedExpenseRow, household_id="hh-priya-family")
    assert s == client.get("/api/household/demo-priya/shared-expenses").json()


def test_removed_member_leaves_balances_but_expenses_stay(hh):
    o, f = hh["owner"], hh["friend"]
    _add(o, amount=100, paid_by=f, split_among=[o, f])
    assert client.delete(f"/api/household/{o}/members/{f}").status_code == 200
    s = client.get(f"/api/household/{o}/shared-expenses").json()
    assert f not in [b["member_id"] for b in s["balances"]] and f not in [m["id"] for m in s["members"]]
    assert all(t["from"] != f and t["to"] != f for t in s["transfers"])
    assert len(s["expenses"]) == 1 and s["expenses"][0]["paid_by"] == f
    assert s["former_members"] == [{"id": f, "name": "Former member"}]
    assert _add(o, amount=10, paid_by=f).status_code == 422  # a former member cannot pay new expenses
