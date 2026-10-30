"""QA5-1: non-finite numbers in a JSON body give a clean 422, never a bare 500, and the input is not echoed."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
GUEST = "guest-qaavalid00001"
HDR = {"content-type": "application/json"}


@pytest.mark.parametrize("path,body", [
    (f"/api/budgets/{GUEST}", '{"category":"dining","monthly_limit":NaN}'),
    (f"/api/budgets/{GUEST}", '{"category":"dining","monthly_limit":1e999}'),
    (f"/api/budgets/{GUEST}", '{"category":"dining","monthly_limit":-Infinity}'),
    ("/api/chat", '{"message":NaN}'),
    ("/api/chat", '{"message":"hi","history":[{"role":"user","content":Infinity}]}'),
    (f"/api/events/{GUEST}", '{"kind":"transaction","amount":1e999}'),
    (f"/api/goals/{GUEST}", '{"name":"x","target_amount":NaN}'),
])
def test_non_finite_numbers_get_422(path, body):
    r = client.post(path, content=body, headers=HDR)
    assert r.status_code == 422, (r.status_code, r.text)
    assert r.headers["content-type"].startswith("application/json")
    assert "input" not in r.text and "Infinity" not in r.text and "NaN" not in r.text


def test_error_shape_matches_fastapi_default_minus_input():
    r = client.post("/api/chat", json={"message": 5})
    d = r.json()["detail"]
    assert r.status_code == 422 and d[0]["loc"] == ["body", "message"] and set(d[0]) == {"type", "loc", "msg"}
