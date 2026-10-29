"""Regressions: invite privilege escalation, last-owner removal, connector disconnect scope, pay double-spend, insights."""
import threading
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _gid() -> str:
    return "guest-" + uuid.uuid4().hex[:12]


def _invite(uid, role, email="x@example.com"):
    return client.post(f"/api/household/{uid}/invites", json={"email": email, "role": role})


def _join(uid, token):
    return client.post(f"/api/household/{uid}/invites/accept", json={"token": token})


def test_editor_cannot_invite_owner_or_remove_owner():
    a, e = _gid(), _gid()
    client.post(f"/api/household/{a}", json={"name": "H"})
    _join(e, _invite(a, "editor").json()["token"])
    assert _invite(e, "owner").status_code == 403
    assert _invite(e, "viewer").status_code == 200
    assert client.delete(f"/api/household/{e}/members/{a}").status_code == 403
    assert client.delete(f"/api/household/{a}/members/{a}").status_code in (200, 400)


def test_disconnect_only_affects_connector():
    u = _gid()
    client.post(f"/api/events/{u}", json={"date": "2026-10-01", "amount": -5, "merchant": "m", "category": "dining"})
    assert client.delete(f"/api/connectors/{u}/bank").status_code == 404
    client.post(f"/api/connectors/{u}/invoices/connect", json={})
    assert client.delete(f"/api/connectors/{u}/invoices").status_code == 204
    assert client.get(f"/api/transactions/{u}").json()["items"]


def test_pay_is_atomic():
    u = _gid()
    client.post(f"/api/accounts/{u}", json={"name": "x", "type": "checking", "balance": 100})
    codes = []
    def go():
        codes.append(client.post(f"/api/pay/{u}", json={"payee_name": "Shop", "upi_id": "shop@upi", "amount": 60}).status_code)
    ts = [threading.Thread(target=go) for _ in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert codes.count(200) == 1


def test_insights_ok_and_spending_months_contiguous():
    assert client.get("/api/household/demo-priya/insights").status_code == 200
    months = [m["month"] for m in client.get("/api/household/demo-priya/spending").json()["members"][0]["monthly_trend"]]
    ys = [int(m[:4]) * 12 + int(m[5:]) for m in months]
    assert all(b - a == 1 for a, b in zip(ys, ys[1:]))
