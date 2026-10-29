"""Backend hardening regressions (B07-B18, B23-B26). None of these need the Firestore emulator:

    cd backend && .venv/bin/python -m pytest -p no:cacheprovider --noconftest tests/test_fix_backend_hardening.py

(The default conftest exits when the emulator is not running; these tests only use guest ids and in-process fakes.)
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core import guard
from app.core.config import get_settings
from app.core.ratelimit import RateLimiter
from app.main import app
from app.schemas import BudgetCreateRequest, ChatRequest, CreateAccountRequest, GoalCreateRequest, TaxCalculationRequest

client = TestClient(app)
GUEST = "guest-abcdef123456"


# --- B07 gating ---------------------------------------------------------------------------------------------
def test_ops_overview_never_exposes_key_tails_in_demo_mode(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-SECRETSECRET-1234")
    monkeypatch.delenv("OPS_ADMIN_TOKEN", raising=False)
    r = client.get("/api/ops/overview")
    assert r.status_code == 200
    assert "1234" not in r.text and "nvapi" not in r.text
    nv = next(k for k in r.json()["keys"] if k["env"] == "NVIDIA_API_KEY")
    assert nv["configured"] and nv["masked"] == "set"


def test_ops_admin_token_unlocks_mask(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-SECRETSECRET-1234")
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "letmein")
    r = client.get("/api/ops/overview", headers={"X-Ops-Token": "letmein"})
    nv = next(k for k in r.json()["keys"] if k["env"] == "NVIDIA_API_KEY")
    assert nv["masked"].endswith("1234")
    assert client.get("/api/ops/overview", headers={"X-Ops-Token": "wrong"}).json()["keys"][0]["masked"] in (None, "set")


def test_ops_closed_outside_demo_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    monkeypatch.delenv("OPS_ADMIN_TOKEN", raising=False)
    assert client.get("/api/ops/overview").status_code == 403
    assert client.post("/api/ops/probe/NVIDIA_API_KEY").status_code == 403


def test_probe_is_rate_limited_per_client(monkeypatch):
    monkeypatch.setattr(guard, "probe_limiter", RateLimiter(2, 60))
    monkeypatch.setattr("app.api.ops_router.probe_limiter", guard.probe_limiter)
    monkeypatch.setattr(guard, "ops_limiter", RateLimiter(100, 60))
    codes = [client.post("/api/ops/probe/NOT_A_KEY").status_code for _ in range(4)]
    assert codes == [404, 404, 429, 429]


def test_translate_and_web_require_sign_in_outside_demo_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    assert client.post("/api/translate", json={"lang": "hi", "texts": ["Hello"]}).status_code == 401
    assert client.post("/api/web/search", json={"query": "ppf rate"}).status_code == 401


def test_translate_rate_limited_per_client(monkeypatch):
    monkeypatch.setattr("app.api.translate_router.translate_limiter", RateLimiter(2, 60))
    monkeypatch.setattr("app.api.translate_router.translate.translate", lambda lang, texts: {})
    codes = [client.post("/api/translate", json={"lang": "hi", "texts": ["x"]}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_web_rate_limited_per_client(monkeypatch):
    monkeypatch.setattr(guard, "web_limiter", RateLimiter(1, 60))
    monkeypatch.setattr("app.api.web_router.web_limiter", guard.web_limiter)
    monkeypatch.setattr(get_settings(), "tavily_api_key", "")
    codes = [client.post("/api/web/map", json={"url": "https://example.com"}).status_code for _ in range(2)]
    assert codes == [503, 429]  # 503 = Tavily not configured, i.e. the request got past the gate


# --- B10-B14 validation -------------------------------------------------------------------------------------
@pytest.mark.parametrize("body", [
    {"kind": "transaction", "amount": "abc"},
    {"kind": "transaction", "amount": "NaN"},
    {"kind": "transaction", "amount": -5, "date": "31/01/2026"},
    {"kind": "transaction", "amount": -5, "category": "bogus"},
    {"kind": "recurring", "amount": -5, "next_expected_date": "soon"},
])
def test_events_reject_bad_payload(body):
    r = client.post(f"/api/events/{GUEST}", json=body)
    assert r.status_code in (400, 422), r.text


def test_events_reject_infinite_amount():
    r = client.post(f"/api/events/{GUEST}", content='{"kind":"transaction","amount":1e999}', headers={"content-type": "application/json"})
    assert r.status_code in (400, 422)


def test_events_missing_amount_and_kind():
    assert client.post(f"/api/events/{GUEST}", json={"kind": "transaction"}).status_code == 400
    assert client.post(f"/api/events/{GUEST}", json={"kind": "nope"}).status_code == 400


def test_events_account_must_belong_to_user(monkeypatch):
    from app.api import routes
    from app.models import AccountRow

    other = AccountRow(user_id="demo-priya", name="x", type="checking", balance=1)
    monkeypatch.setattr(routes.store, "get", lambda model, id: other)
    r = client.post(f"/api/events/{GUEST}", json={"kind": "transaction", "amount": -5, "account_id": other.id})
    assert r.status_code == 400


@pytest.mark.parametrize("path,qs", [
    ("plan", "reserve=1e999"), ("plan", "reserve=nan"), ("forecast-risk", "reserve=inf"),
    ("forecast-risk", "seed=-1"), ("forecast-risk", "source=synthetic&synth_seed=-5"),
])
def test_non_finite_and_negative_query_params_are_422(path, qs):
    assert client.get(f"/api/{path}/{GUEST}?{qs}").status_code == 422


def test_schema_guards():
    for bad in ({"category": "dining", "monthly_limit": 1e999}, {"category": "dining", "monthly_limit": -1}):
        with pytest.raises(ValidationError):
            BudgetCreateRequest(**bad)
    with pytest.raises(ValidationError):
        CreateAccountRequest(name="a", type="checking", balance=float("inf"))
    with pytest.raises(ValidationError):
        GoalCreateRequest(name="g", target_amount=-100)
    with pytest.raises(ValidationError):
        GoalCreateRequest(name="g", target_amount=0)
    with pytest.raises(ValidationError):
        TaxCalculationRequest(gross_annual_income=-1)
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 5000)


def test_invalid_regex_rule_rejected():
    r = client.post(f"/api/rules/{GUEST}", json={"match_type": "regex", "pattern": "([", "category": "dining"})
    assert r.status_code == 400


def test_zero_budget_limit_with_spend_is_over(monkeypatch):
    from app.api import budgets_router
    from app.models import BudgetRow, TransactionRow

    today = datetime.now(timezone.utc).date()
    b = BudgetRow(user_id=GUEST, category="dining", monthly_limit=0.0)
    t = TransactionRow(user_id=GUEST, account_id="a", date=today, amount=-50.0, merchant="Cafe", category="dining")
    monkeypatch.setattr(budgets_router.store, "query", lambda model, **kw: [b] if model is BudgetRow else [t])
    (s,) = budgets_router.budget_status(GUEST)
    assert s.status == "over" and s.remaining == -50.0


# --- B15 gap alert ------------------------------------------------------------------------------------------
def test_gap_alert_refuses_demo_and_foreign_addresses(monkeypatch):
    monkeypatch.setattr(get_settings(), "resend_api_key", "re_test")
    r = client.post("/api/alerts/gap/demo-priya", json={"email": "victim@example.com"})
    assert r.status_code == 403
    r = client.post(f"/api/alerts/gap/{GUEST}", json={"email": "victim@example.com"})
    assert r.status_code == 403


def test_gap_alert_only_to_token_email(monkeypatch):
    from app.api import routes

    monkeypatch.setattr(get_settings(), "resend_api_key", "re_test")
    monkeypatch.setattr(routes, "verify_token", lambda t: {"sub": "u1", "email": "me@example.com", "email_verified": True})
    monkeypatch.setattr(routes, "is_public_user", lambda u: False)
    monkeypatch.setattr(routes, "resolve_user_id", routes.resolve_user_id)
    app.dependency_overrides[routes.resolve_user_id] = lambda: "u1"
    try:
        h = {"Authorization": "Bearer t"}
        assert client.post("/api/alerts/gap/u1", json={"email": "victim@example.com"}, headers=h).status_code == 403
    finally:
        app.dependency_overrides.pop(routes.resolve_user_id, None)


# --- B16 / B25 limiter ----------------------------------------------------------------------------------------
def test_demo_users_are_limited_per_client_not_globally():
    from types import SimpleNamespace
    from app.core.ratelimit import scoped_key

    def req(ip):
        return SimpleNamespace(headers={"x-forwarded-for": ip}, client=None)

    assert scoped_key(req("1.1.1.1"), "demo-priya") != scoped_key(req("2.2.2.2"), "demo-priya")
    assert scoped_key(req("1.1.1.1"), "real-user") == "real-user"


def test_limiter_evicts_idle_keys():
    lim = RateLimiter(1, 0.3)
    for i in range(5001):
        lim.check(f"ip{i}")
    import time

    time.sleep(0.4)
    lim.check("fresh")
    assert len(lim._calls) < 100


# --- B18 AA consent bound to user -------------------------------------------------------------------------------
def test_aa_consent_is_bound_to_user():
    from app.aa import mock

    handle = mock.create_consent("9876543210", "priya", 3, "guest-aaaaaaaaaaaa")["handle"]
    r = client.post(f"/api/aa/{GUEST}/consent/approve", json={"handle": handle, "otp": mock.DEMO_OTP})
    assert r.status_code == 403
    consent = mock.approve(handle, mock.DEMO_OTP)["consent_id"]
    assert mock.owner(consent, "consent") == "guest-aaaaaaaaaaaa"
    assert client.post(f"/api/aa/{GUEST}/import", json={"consent_id": consent}).status_code == 403


# --- B26 offline copilot amount -----------------------------------------------------------------------------------
@pytest.mark.parametrize("msg,val", [
    ("Can I afford a 50000 phone?", 50000), ("afford 50,000", 50000), ("afford 2 lakh", 200000),
    ("rs 5k", 5000), ("in 6 months", None), ("in 2026", None),
])
def test_offline_amount_extraction(msg, val):
    from app.copilot.offline_router import _extract_amount

    assert _extract_amount(msg) == val


# --- B23 CORS -----------------------------------------------------------------------------------------------------
def test_localhost_cors_on_in_dev_by_default():
    r = client.options("/api/schemes", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
