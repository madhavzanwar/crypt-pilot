"""Setu status webhook: Instatus signs the compact JSON body with HMAC-SHA256 in x-instatus-webhook-signature."""
import hashlib
import hmac
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.webhooks_router import router

app = FastAPI()
app.include_router(router, prefix="/api")
client = TestClient(app)
URL = "/api/webhooks/setu-status"
BODY = {"page": {"status_indicator": "HASISSUES"}, "incident": {"name": "Digilocker High Upstream Latency", "status": "INVESTIGATING"}}


def _sign(secret: str, payload: dict) -> str:
    return hmac.new(secret.encode(), json.dumps(payload, separators=(",", ":")).encode(), hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("SETU_STATUS_WEBHOOK_SECRET", "s3cret")


def test_valid_signature_is_accepted():
    r = client.post(URL, json=BODY, headers={"x-instatus-webhook-signature": _sign("s3cret", BODY)})
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_wrong_signature_is_rejected():
    assert client.post(URL, json=BODY, headers={"x-instatus-webhook-signature": _sign("other", BODY)}).status_code == 401


def test_missing_signature_is_rejected():
    assert client.post(URL, json=BODY).status_code == 400
