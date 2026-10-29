"""Tests for 5D COLLABORATE: Household models, multi-member co-piloting, hashed invites, and combined net worth."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import HouseholdInviteRow, HouseholdMemberRow, HouseholdRow
from app.ingest.seed import seed_all


@pytest.fixture(autouse=True)
def _clean_seed():
    seed_all()
    yield


client = TestClient(app)


def test_get_household_demo_priya():
    resp = client.get("/api/household/demo-priya")
    assert resp.status_code == 200
    data = resp.json()

    assert data["household"]["name"] == "Priya's Family"
    assert data["user_role"] == "owner"
    assert len(data["members"]) == 4

    roles = {m["display_name"]: m["role"] for m in data["members"]}
    assert roles == {"Priya": "owner", "Rishi": "editor", "Swara": "viewer", "Vedant": "viewer"}

    # Check combined net worth
    nw_summary = data["net_worth_summary"]
    assert "total_net_worth" in nw_summary
    assert "total_assets" in nw_summary
    assert "total_liabilities" in nw_summary
    assert len(nw_summary["members_breakdown"]) == 4


def test_get_household_unassigned_user():
    resp = client.get("/api/household/demo-meera")
    assert resp.status_code == 404


def test_create_household_demo_meera():
    payload = {"name": "Meera's Financial Hub"}
    resp = client.post("/api/household/demo-meera", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["household"]["name"] == "Meera's Financial Hub"
    assert data["user_role"] == "owner"
    assert len(data["members"]) == 1
    assert data["members"][0]["user_id"] == "demo-meera"


def test_create_and_accept_invite():
    # Priya invites Meera
    invite_resp = client.post(
        "/api/household/demo-priya/invites",
        json={"email": "meera@example.com", "role": "editor"},
    )
    assert invite_resp.status_code == 200
    invite_data = invite_resp.json()
    assert invite_data["invited_email"] == "meera@example.com"
    assert invite_data["token"] is not None
    token = invite_data["token"]

    # Try accepting with invalid token as Meera
    bad_resp = client.post(
        "/api/household/demo-meera/invites/accept",
        json={"token": "completely-invalid-token"},
    )
    assert bad_resp.status_code == 404

    # Meera accepts valid token
    accept_resp = client.post(
        "/api/household/demo-meera/invites/accept",
        json={"token": token},
    )
    assert accept_resp.status_code == 200
    accepted_data = accept_resp.json()
    assert len(accepted_data["members"]) == 5
    meera_member = next(m for m in accepted_data["members"] if m["user_id"] == "demo-meera")
    assert meera_member["role"] == "editor"


def test_revoke_invite():
    # Priya creates an invite and revokes it
    inv_resp = client.post(
        "/api/household/demo-priya/invites",
        json={"email": "temp-invite@test.com", "role": "viewer"},
    )
    assert inv_resp.status_code == 200
    inv_id = inv_resp.json()["id"]

    del_resp = client.delete(f"/api/household/demo-priya/invites/{inv_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["revoked"] is True


def test_remove_member_permission():
    # Meera joins as an editor, and an editor cannot remove the owner
    token = client.post("/api/household/demo-priya/invites", json={"email": "meera@example.com", "role": "editor"}).json()["token"]
    assert client.post("/api/household/demo-meera/invites/accept", json={"token": token}).status_code == 200
    assert client.delete("/api/household/demo-meera/members/demo-priya").status_code == 403

    # Priya (owner) can remove a member
    owner_del_resp = client.delete("/api/household/demo-priya/members/demo-meera")
    assert owner_del_resp.status_code == 200
    assert owner_del_resp.json()["removed"] is True


def test_priya_sees_every_family_members_spending():
    resp = client.get("/api/household/demo-priya/spending")
    assert resp.status_code == 200
    data = resp.json()
    assert data["can_view_all"] is True and data["viewer_role"] == "owner" and data["days"] == 30
    by_name = {m["display_name"]: m for m in data["members"]}
    assert list(by_name) == ["Priya", "Rishi", "Swara", "Vedant"]  # owner first, then by role
    assert {n: m["relation"] for n, m in by_name.items()} == {"Priya": "Mother", "Rishi": "Husband", "Swara": "Daughter", "Vedant": "Son"}
    for m in by_name.values():
        assert m["total_spend"] > 0 and m["by_category"] and m["recent"] and len(m["monthly_trend"]) == 6
        assert all(t["amount"] > 0 for t in m["recent"])
    assert abs(sum(m["share_pct"] for m in by_name.values()) - 100) < 0.5
    assert abs(sum(m["total_spend"] for m in by_name.values()) - data["total_spend"]) < 0.05
    # the kids spend pocket-money amounts, the parents far more
    assert by_name["Vedant"]["total_spend"] < by_name["Swara"]["total_spend"] < by_name["Rishi"]["total_spend"] < by_name["Priya"]["total_spend"]


def test_spending_excludes_card_bill_payments_sips_and_planted_threats():
    data = client.get("/api/household/demo-priya/spending?days=90").json()
    cats = {c["category"] for m in data["members"] for c in m["by_category"]}
    assert not cats & {"credit_card_payment", "transfer", "income", "investment_sip"}
    merchants = {t["merchant"] for m in data["members"] for t in m["recent"]}
    assert "Unknown Intl Wire" not in merchants  # an Evidence Room demo threat


def test_viewer_only_sees_their_own_spending(monkeypatch):
    # Swara is a viewer: the endpoint must hide everyone else even if she were able to call it
    from app.api import household_router as hr

    monkeypatch.setattr(hr, "resolve_user_id", hr.resolve_user_id)  # keep import used
    from app.core.auth import resolve_user_id as _r

    app.dependency_overrides[_r] = lambda: "demo-swara"
    try:
        data = client.get("/api/household/demo-swara/spending").json()
    finally:
        app.dependency_overrides.pop(_r, None)
    assert data["can_view_all"] is False and data["viewer_role"] == "viewer"
    assert [m["display_name"] for m in data["members"]] == ["Swara"]
    assert data["members"][0]["share_pct"] == 100.0


def test_spending_requires_a_household():
    assert client.get("/api/household/demo-meera/spending").status_code == 404


def test_seed_family_replaces_an_older_demo_household():
    from app.core import store
    from app.ingest.seed import seed_family
    from app.models import HouseholdRow

    store.put(HouseholdRow(id="hh-priya-arjun", name="Priya & Partner Family", owner_user_id="demo-priya"))
    seed_family()
    assert store.get(HouseholdRow, "hh-priya-arjun") is None
    names = [h.name for h in store.query(HouseholdRow, owner_user_id="demo-priya")]
    assert names == ["Priya's Family"]


def test_household_networth_endpoint():
    resp = client.get("/api/household/demo-priya/networth")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_net_worth" in data
    assert "members_breakdown" in data


def test_wealth_shares_add_up_to_100():
    data = client.get("/api/household/demo-priya").json()
    shares = {m["display_name"]: m["pct_of_household"] for m in data["net_worth_summary"]["members_breakdown"]}
    assert abs(sum(shares.values()) - 100) < 0.2
    assert all(0 <= v <= 100 for v in shares.values())


def test_managed_member_lifecycle():
    base = len(client.get("/api/household/demo-priya").json()["members"])
    r = client.post("/api/household/demo-priya/managed-members", json={"name": "Anaya", "relationship": "Child", "opening_balance": 500})
    assert r.status_code == 200
    kid = next(m for m in r.json()["members"] if m["is_managed"])
    assert kid["display_name"] == "Anaya" and kid["user_id"].startswith("managed-")
    assert len(r.json()["members"]) == base + 1

    t = client.post(f"/api/household/demo-priya/members/{kid['user_id']}/transactions",
                    json={"merchant": "School fees", "amount": -300, "category": "other"})
    assert t.status_code == 200
    assert t.json()["balance"] == 200 and t.json()["total_out"] == 300

    # Real members' data can't be written through this endpoint
    assert client.post("/api/household/demo-priya/members/demo-rishi/transactions",
                       json={"merchant": "x", "amount": -1}).status_code == 404
    # Priya can monitor Rishi
    assert client.get("/api/household/demo-priya/members/demo-rishi/ledger").status_code == 200
    # Rishi (editor) can see the kid too; managed ids are not usable as logins
    assert client.get(f"/api/household/{kid['user_id']}").status_code in (401, 403, 404)

    d = client.delete(f"/api/household/demo-priya/members/{kid['user_id']}")
    assert d.status_code == 200
    assert len(client.get("/api/household/demo-priya").json()["members"]) == base
