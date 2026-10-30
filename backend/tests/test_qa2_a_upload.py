"""QA-3 / QA-17: CSV statements through /api/ocr/extract, Dr/Cr markers, and a rate limiter that ignores failed attempts."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.core.ratelimit import RateLimiter, upload_limiter
from app.main import app
from app.statement_ocr import clean_description, parse_transactions

client = TestClient(app, raise_server_exceptions=False)


def _guest() -> str:
    return "guest-" + uuid.uuid4().hex[:12]


def _extract(uid: str, name: str, body: bytes):
    return client.post(f"/api/ocr/extract/{uid}", files={"file": (name, body, "text/csv")})


def test_csv_with_debit_credit_columns_and_ddmmyyyy_dates():
    csv = ("Date,Description,Debit,Credit,Balance\n"
           "01/10/2026,Swiggy Order,450.00,,9550.00\n"
           "02/10/2026,Salary ACME,,50000.00,59550.00\n"
           "15/10/2026,Rent,15000.00,,44550.00\n")
    r = _extract(_guest(), "stmt.csv", csv.encode())
    assert r.status_code == 200, r.text
    rows = r.json()["transactions"]
    assert [(t["date"], t["description"], t["amount"]) for t in rows] == [
        ("2026-10-01", "Swiggy Order", -450.0), ("2026-10-02", "Salary ACME", 50000.0), ("2026-10-15", "Rent", -15000.0)]


def test_csv_with_narration_and_signed_amount():
    csv = "Date,Narration,Amount\n2026-05-01,Swiggy,-200\n2026-05-02,Refund Amazon,150.50\n"
    r = _extract(_guest(), "bank.csv", csv.encode())
    assert r.status_code == 200, r.text
    assert [t["amount"] for t in r.json()["transactions"]] == [-200.0, 150.5]


def test_csv_then_import_flow_stores_rows():
    uid = _guest()
    rows = _extract(uid, "s.csv", b"Date,Description,Amount\n2026-05-01,Swiggy,-200\n").json()["transactions"]
    r = client.post(f"/api/ocr/import/{uid}", json={"transactions": rows})
    assert r.status_code == 200 and r.json()["imported"] == 1


def test_csv_without_usable_rows_says_what_is_needed():
    r = _extract(_guest(), "x.csv", b"foo,bar\n1,2\n")
    assert r.status_code == 422
    assert "Date column" in r.json()["detail"] and "photo" not in r.json()["detail"]


def test_text_statement_still_works_and_drops_dr_cr_tokens():
    txt = "01/10/2026 Swiggy Order 450.00 Dr\n02/10/2026 Salary ACME 50000.00 Cr\n"
    r = client.post(f"/api/ocr/extract/{_guest()}", files={"file": ("s.txt", txt.encode(), "text/plain")})
    assert r.status_code == 200, r.text
    got = [(t["description"], t["amount"]) for t in r.json()["transactions"]]
    assert got == [("Swiggy Order", -450.0), ("Salary ACME", 50000.0)]


def test_clean_description_only_removes_standalone_markers():
    assert clean_description("Swiggy Order  Dr") == "Swiggy Order"
    assert clean_description("CR Salary ACME") == "Salary ACME"
    assert clean_description("UPI/DR/1234 Shop") == "UPI/DR/1234 Shop"
    assert parse_transactions("03/10/2026 Uber Trip 240.00 DR")[0]["description"] == "Uber Trip"


def test_failed_uploads_do_not_use_up_the_allowance(monkeypatch):
    lim = RateLimiter(2, 3600)
    monkeypatch.setattr("app.api.ocr_router.upload_limiter", lim)
    uid = _guest()
    for _ in range(5):  # bad type and unreadable files are rejected without counting
        assert _extract(uid, "x.pdf", b"x").status_code == 400
        assert _extract(uid, "x.csv", b"foo,bar\n1,2\n").status_code == 422
    good = b"Date,Description,Amount\n2026-05-01,Swiggy,-200\n"
    assert _extract(uid, "a.csv", good).status_code == 200
    assert _extract(uid, "b.csv", good).status_code == 200
    r = _extract(uid, "c.csv", good)
    assert r.status_code == 429


def test_rate_limit_429_is_friendly_json():
    lim = RateLimiter(1, 3600)
    lim.check("k")
    from fastapi import HTTPException
    try:
        lim.check("k")
    except HTTPException as e:
        assert e.status_code == 429
        assert "Rate limit exceeded" not in e.detail and "3600s" not in e.detail
        assert "an hour" in e.detail and e.headers["Retry-After"]
    else:
        raise AssertionError("expected 429")


def test_shared_upload_limiter_object_still_exists():
    assert upload_limiter.max_calls == 10
