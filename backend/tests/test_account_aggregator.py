"""Account Aggregator flow: consent -> OTP -> encrypted fetch -> mapped rows, with every failure turned into a clear error."""
import pytest
from fastapi.testclient import TestClient

from app.aa import AAError, mapper, mock
from app.core import store
from app.main import app
from app.models import AccountRow, ConnectionRow, TransactionRow

c = TestClient(app)
UID = "guest-aatest00000001"


@pytest.fixture(autouse=True)
def _mock_aa(monkeypatch):
    monkeypatch.delenv("AA_PROVIDER", raising=False)  # backend/.env may select Setu; these tests use the mock unless they opt in


def _consent(mobile="9876543210", **kw):
    r = c.post(f"/api/aa/{UID}/consent", json={"mobile": mobile, **kw})
    assert r.status_code == 200, r.text
    return r.json()["handle"]


def _active():
    r = c.post(f"/api/aa/{UID}/consent/approve", json={"handle": _consent(), "otp": mock.DEMO_OTP})
    assert r.status_code == 200, r.text
    return r.json()["consent_id"]


def _cleanup():
    from app.ingest.seed import _clear_user
    _clear_user(UID)
    store.delete(ConnectionRow, f"{UID}:google_pay")


def test_full_flow_imports_accounts_and_transactions():
    try:
        r = c.post(f"/api/aa/{UID}/import", json={"consent_id": _active()})
        assert r.status_code == 200 and r.json()["accounts"] == 2 and r.json()["transactions"] > 100
        assert len(store.query(AccountRow, user_id=UID)) == 2
        txns = store.query(TransactionRow, user_id=UID)
        assert any(t.amount < 0 for t in txns) and any(t.amount > 0 for t in txns)
        assert all(t.merchant and "/" not in t.merchant for t in txns)  # merchant parsed out of the UPI narration
        assert store.get(ConnectionRow, f"{UID}:google_pay").detail == "2 accounts via Account Aggregator"
        again = _active()  # linking again replaces, never duplicates
        c.post(f"/api/aa/{UID}/import", json={"consent_id": again})
        assert len(store.query(TransactionRow, user_id=UID)) == len(txns)
    finally:
        _cleanup()


@pytest.mark.parametrize("mobile", ["", "12345", "5876543210", "98765abcde", "98765432101"])
def test_bad_mobile_is_rejected(mobile):
    assert c.post(f"/api/aa/{UID}/consent", json={"mobile": mobile}).status_code == 422


def test_wrong_otp_and_tampered_or_wrong_tokens_are_clear_errors():
    handle = _consent()
    assert c.post(f"/api/aa/{UID}/consent/approve", json={"handle": handle, "otp": "000000"}).status_code == 400
    assert c.post(f"/api/aa/{UID}/consent/approve", json={"handle": handle + "x", "otp": mock.DEMO_OTP}).status_code == 400
    assert c.post(f"/api/aa/{UID}/import", json={"consent_id": handle}).status_code == 400  # a handle is not a consent
    assert c.post(f"/api/aa/{UID}/import", json={"consent_id": "garbage"}).status_code == 400
    assert c.post(f"/api/aa/{UID}/consent", json={"mobile": "9876543210", "months": 99}).status_code == 422
    assert c.post(f"/api/aa/{UID}/consent", json={"mobile": "9876543210", "profile": "nobody"}).status_code == 422


def test_expired_consent_is_410(monkeypatch):
    consent = _active()
    monkeypatch.setattr(mock.time, "time", lambda: 9e12)
    r = c.post(f"/api/aa/{UID}/import", json={"consent_id": consent})
    assert r.status_code == 410 and "expired" in r.json()["detail"]


def test_failed_import_leaves_existing_data_untouched(monkeypatch):
    try:
        c.post(f"/api/aa/{UID}/import", json={"consent_id": _active()})
        before = len(store.query(TransactionRow, user_id=UID))
        monkeypatch.setattr(mock, "decrypt", lambda *a: (_ for _ in ()).throw(AAError("boom", 502)))
        assert c.post(f"/api/aa/{UID}/import", json={"consent_id": _active()}).status_code == 502
        assert len(store.query(TransactionRow, user_id=UID)) == before
    finally:
        _cleanup()


def test_demo_persona_link_never_wipes_fixture():
    base = len(store.query(TransactionRow, user_id="demo-priya"))
    h = c.post("/api/aa/demo-priya/consent", json={"mobile": "9876543210"}).json()["handle"]
    consent = c.post("/api/aa/demo-priya/consent/approve", json={"handle": h, "otp": mock.DEMO_OTP}).json()["consent_id"]
    assert c.post("/api/aa/demo-priya/import", json={"consent_id": consent}).status_code == 200
    assert len(store.query(TransactionRow, user_id="demo-priya")) == base


def test_decrypt_roundtrip_and_wrong_key_fails():
    priv, pub = mock.new_keypair()
    consent = mock.approve(mock.create_consent("9876543210", "priya", 3)["handle"], mock.DEMO_OTP)["consent_id"]
    resp = mock.fetch(consent, pub)
    assert "accounts" in mock.decrypt(priv, resp) and "Priya" not in resp["encryptedFI"]
    other, _ = mock.new_keypair()
    with pytest.raises(AAError):
        mock.decrypt(other, resp)


def test_mapper_rejects_malformed_bank_data():
    with pytest.raises(AAError):
        mapper.to_rows("u", {"accounts": [{"linkedAccRef": "x", "data": {"type": "deposit", "summary": {}}}]})


# --- Setu gateway (HTTP calls faked; no network) ---

_SETU_SESSION = {"status": "COMPLETED", "fips": [{"fipID": "setu-fip", "accounts": [{"linkRefNumber": "r1", "maskedAccNumber": "XXXX4373", "status": "DELIVERED", "data": {"account": {
    "linkedAccRef": "r1", "maskedAccNumber": "XXXXXX4373", "type": "deposit",
    "profile": {"holders": {"type": "SINGLE", "holder": [{"name": "Asha Rao", "mobile": "9876543210"}]}},
    "summary": {"currentBalance": "5000.00", "type": "SAVINGS"},
    "transactions": {"transaction": [
        {"txnId": "t1", "type": "CREDIT", "amount": "100.00", "valueDate": "2026-09-01T10:00:00+00:00", "narration": "UPI/CR/457233689286/Gatik Yohannan/CZBR/64321752"},
        {"txnId": "t2", "type": "DEBIT", "amount": "40.00", "valueDate": "2026-09-02T10:00:00+00:00", "narration": "UPI/DR/123/Swiggy/HDFC/9"}]}}}},
    {"maskedAccNumber": "XXXX1", "status": "TIMEOUT", "data": None}]}]}


def _fake_setu(monkeypatch, consent_status="ACTIVE", session=_SETU_SESSION):
    from app.aa import setu
    monkeypatch.setenv("AA_PROVIDER", "setu")
    for k in ("AA_CLIENT_ID", "AA_CLIENT_SECRET", "AA_PRODUCT_INSTANCE_ID"):
        monkeypatch.setenv(k, "x")
    def call(method, path, body=None):
        if method == "POST" and path == "/v2/consents":
            return {"id": "c1", "url": "https://fiu-sandbox.setu.co/v2/consents/webview/c1", "status": "PENDING"}
        if path.startswith("/v2/consents/"):
            return {"status": consent_status, "detail": {"dataRange": {"from": "a", "to": "b"}}}
        if method == "POST":
            return {"id": "s1"}
        return session
    monkeypatch.setattr(setu, "_call", call)
    return setu


def test_setu_consent_returns_redirect_and_checks_inputs(monkeypatch):
    _fake_setu(monkeypatch)
    r = c.post(f"/api/aa/{UID}/consent", json={"mobile": "9876543210", "return_url": "http://localhost:3000/connect"})
    assert r.status_code == 200 and r.json()["handle"] == "c1" and r.json()["redirect_url"].startswith("https://fiu-sandbox")
    assert c.post(f"/api/aa/{UID}/consent", json={"mobile": "12345", "return_url": "http://x"}).status_code == 422
    assert c.post(f"/api/aa/{UID}/consent", json={"mobile": "9876543210", "return_url": "javascript:alert(1)"}).status_code == 422


def test_setu_import_maps_delivered_accounts_and_skips_failed_banks(monkeypatch):
    _fake_setu(monkeypatch)
    try:
        r = c.post(f"/api/aa/{UID}/import", json={"consent_id": "c1"})
        assert r.status_code == 200 and r.json()["accounts"] == 1 and r.json()["transactions"] == 2
        assert {t.merchant for t in store.query(TransactionRow, user_id=UID)} == {"Gatik Yohannan", "Swiggy"}
    finally:
        _cleanup()


def test_setu_unapproved_or_failed_session_is_a_clear_error(monkeypatch):
    _fake_setu(monkeypatch, consent_status="PENDING")
    r = c.post(f"/api/aa/{UID}/import", json={"consent_id": "c1"})
    assert r.status_code == 409 and "not approved" in r.json()["detail"]
    _fake_setu(monkeypatch, session={"status": "FAILED"})
    assert c.post(f"/api/aa/{UID}/import", json={"consent_id": "c1"}).status_code == 502


def test_setu_is_off_without_a_product_id(monkeypatch):
    from app.aa import setu
    monkeypatch.setenv("AA_PROVIDER", "setu")
    monkeypatch.setenv("AA_PRODUCT_INSTANCE_ID", "")
    assert not setu.enabled()  # falls back to the mock, so the demo never breaks
