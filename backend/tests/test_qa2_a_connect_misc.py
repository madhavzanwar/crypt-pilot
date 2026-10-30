"""QA-4/15/16/18/19 + access-log wording."""
from __future__ import annotations

import io
import sys
import uuid
from datetime import date, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.audit import humanise_action
from app.ingest.seed import seed_all
from app.main import app

seed_all()
client = TestClient(app, raise_server_exceptions=False)


def _guest() -> str:
    return "guest-" + uuid.uuid4().hex[:12]


def test_dataset_connector_is_honest_about_bringing_no_data():
    r = client.post(f"/api/connectors/{_guest()}/bank/connect", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] is True and body["has_data"] is False
    assert body["message"].startswith("Connected. No transactions yet")
    assert "accounts" in body  # existing shape is kept


def test_google_sheet_failure_carries_sharing_hint(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("blocked")
    monkeypatch.setattr("app.api.connectors_router.httpx.get", boom)
    r = client.post(f"/api/connectors/{_guest()}/google_sheets/connect", json={"url": "https://docs.google.com/spreadsheets/d/abc123/edit"})
    assert r.status_code == 502
    j = r.json()
    assert isinstance(j["detail"], str) and "Anyone with the link" in j["hint"]


def test_past_goal_date_rejected_unless_achieved():
    uid = _guest()
    past = (date.today() - timedelta(days=30)).isoformat()
    r = client.post(f"/api/goals/{uid}", json={"name": "Trip", "target_amount": 1000, "target_date": past})
    assert r.status_code == 422
    ok = client.post(f"/api/goals/{uid}", json={"name": "Done", "target_amount": 1000, "current_amount": 1000, "target_date": past})
    assert ok.status_code == 200
    fut = (date.today() + timedelta(days=90)).isoformat()
    g = client.post(f"/api/goals/{uid}", json={"name": "Trip", "target_amount": 1000, "target_date": fut}).json()["goal"]
    assert client.patch(f"/api/goals/{uid}/{g['id']}", json={"target_date": past}).status_code == 422
    assert client.patch(f"/api/goals/{uid}/{g['id']}", json={"current_amount": 50}).status_code == 200


def test_invite_rejects_bad_email_and_owner_role_for_non_owner():
    uid = _guest()
    assert client.post(f"/api/household/{uid}", json={"name": "Home"}).status_code == 200
    assert client.post(f"/api/household/{uid}/invites", json={"email": "bad", "role": "editor"}).status_code == 422
    assert client.post(f"/api/household/{uid}/invites", json={"email": "a@b", "role": "viewer"}).status_code == 422
    assert client.post(f"/api/household/{uid}/invites", json={"email": "a@example.com", "role": "viewer"}).status_code == 200
    # an editor cannot hand out owner
    owner, editor = _guest(), _guest()
    client.post(f"/api/household/{owner}", json={"name": "Home"})
    tok = client.post(f"/api/household/{owner}/invites", json={"email": "e@example.com", "role": "editor"}).json()["token"]
    assert client.post(f"/api/household/{editor}/invites/accept", json={"token": tok}).status_code == 200
    assert client.post(f"/api/household/{editor}/invites", json={"email": "o@example.com", "role": "owner"}).status_code == 403


def test_managed_member_rejects_negative_opening_balance():
    uid = _guest()
    client.post(f"/api/household/{uid}", json={"name": "Home"})
    r = client.post(f"/api/household/{uid}/managed-members", json={"name": "Kid", "opening_balance": -500})
    assert r.status_code == 422


def test_photo_without_embedding_library_is_503(monkeypatch):
    monkeypatch.setitem(sys.modules, "fastembed", None)
    from app.expenses import vision
    vision._image_model.cache_clear()
    b = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(b, "PNG")
    r = client.post(f"/api/expenses/{_guest()}/snap", files={"photo": ("x.png", b.getvalue(), "image/png")})
    assert r.status_code == 503
    assert "Type the item name" in r.json()["detail"]


@pytest.mark.parametrize("event,method,path,expected", [
    ("mutation", "GET", "/api/connectors/u/bank/export", "Exported data"),
    ("mutation", "POST", "/api/connectors/u/bank/connect", "Connected a data source"),
    ("mutation", "POST", "/api/goals/u", "Added goal"),
    ("mutation", "DELETE", "/api/connectors/u/bank", "Disconnected a data source"),
    ("rate_limited", "POST", "/api/upload/u", "Request blocked: too many requests"),
])
def test_access_log_actions_are_readable(event, method, path, expected):
    assert humanise_action(event, method, path) == expected
    assert "/api/" not in humanise_action(event, method, path)


def test_my_data_access_log_has_readable_action():
    uid = _guest()
    client.post(f"/api/goals/{uid}", json={"name": "Trip", "target_amount": 1000})
    log = client.get(f"/api/security/{uid}/data")
    if log.status_code == 200:
        for entry in log.json()["access_log"]:
            assert not entry["action"].startswith(("POST ", "GET ", "PUT ", "DELETE "))
