"""Setu Account Aggregator gateway (FIU APIs). Used instead of mock.py when AA_PROVIDER=setu and the AA_* keys are set.

Setu hosts the FIU service, so it decrypts the bank data for us and we get plain FI JSON; no Rahasya keys here.
Docs: https://docs.setu.co/data/account-aggregator
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone

import httpx

from app.aa import AAError

_TOKEN_URL = "https://accountservice.setu.co/v1/users/login"
_TOKEN_TTL = 20 * 60  # Setu tokens last about 30 minutes; refresh early
_POLL_SECONDS = 25
_token: tuple[str, float] = ("", 0.0)


def enabled() -> bool:
    return os.getenv("AA_PROVIDER") == "setu" and all(os.getenv(k) for k in ("AA_CLIENT_ID", "AA_CLIENT_SECRET", "AA_PRODUCT_INSTANCE_ID"))


def _base() -> str:
    return os.getenv("AA_BASE_URL", "https://fiu-sandbox.setu.co").rstrip("/")


def _fail(r: httpx.Response) -> AAError:
    try:
        msg = r.json().get("errorMsg") or ""
    except ValueError:
        msg = ""
    status = 502 if r.status_code >= 500 else 400
    return AAError(msg or "The Account Aggregator could not complete this request. Please try again.", status)


def _access_token() -> str:
    global _token
    if _token[0] and _token[1] > time.time():
        return _token[0]
    try:
        r = httpx.post(_TOKEN_URL, headers={"client": "bridge"}, timeout=15,
                       json={"clientID": os.environ["AA_CLIENT_ID"], "secret": os.environ["AA_CLIENT_SECRET"], "grant_type": "client_credentials"})
    except httpx.HTTPError as exc:
        raise AAError("Could not reach the Account Aggregator. Please try again.", 502) from exc
    if r.status_code >= 400 or "access_token" not in r.json():
        raise AAError("The Account Aggregator rejected our credentials.", 502)
    _token = (r.json()["access_token"], time.time() + _TOKEN_TTL)
    return _token[0]


def _call(method: str, path: str, body: dict | None = None) -> dict:
    try:
        r = httpx.request(method, f"{_base()}{path}", json=body, timeout=20, headers={
            "Authorization": f"Bearer {_access_token()}", "x-product-instance-id": os.environ["AA_PRODUCT_INSTANCE_ID"]})
    except httpx.HTTPError as exc:
        raise AAError("Could not reach the Account Aggregator. Please try again.", 502) from exc
    if r.status_code >= 400:
        raise _fail(r)
    return r.json()


def _iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def create_consent(mobile: str, months: int, redirect_url: str) -> dict:
    """POST /v2/consents. The user then approves on Setu's own screens at `url` (mobile OTP, bank linking)."""
    now = datetime.now(timezone.utc)
    r = _call("POST", "/v2/consents", {
        "consentDuration": {"unit": "MONTH", "value": "1"},
        "vua": mobile,
        "dataRange": {"from": _iso(now - timedelta(days=30 * months)), "to": _iso(now)},
        "redirectUrl": redirect_url,
        "context": [],
    })
    if not r.get("id") or not r.get("url"):
        raise AAError("The Account Aggregator sent an unexpected reply.", 502)
    return {"handle": r["id"], "redirect_url": r["url"], "status": r.get("status", "PENDING")}


def _holder(h):
    return h[0] if isinstance(h, list) and h else h


def normalize(session: dict) -> dict:
    """Setu session JSON -> the {"accounts": [{linkedAccRef, data}]} shape mapper.to_rows reads."""
    accounts = []
    for fip in session.get("fips") or []:
        for acc in fip.get("accounts") or []:
            d = ((acc.get("data") or {}).get("account")) or (acc.get("decryptedFI") or {}).get("account")
            if not d:
                continue  # that bank has not delivered (status DENIED / TIMEOUT / FAILED)
            d = {**d, "profile": {"holders": {"holder": _holder(d["profile"]["holders"]["holder"])}}}
            d["transactions"]["transaction"] = d["transactions"].get("transaction") or []
            accounts.append({"fipId": fip.get("fipID"), "linkedAccRef": d["linkedAccRef"], "data": d})
    return {"accounts": accounts}


def fetch(consent_id: str) -> dict:
    """Check the consent is approved, open a data session, wait for the banks, return normalized FI data."""
    c = _call("GET", f"/v2/consents/{consent_id}?expanded=true")
    status = c.get("status")
    if status in ("PENDING", "INITIATED"):
        raise AAError("You have not approved the consent yet. Finish the approval and try again.", 409)
    if status != "ACTIVE":
        raise AAError("The consent was not approved or has expired. Start again.", 400)
    rng = (c.get("detail") or {}).get("dataRange") or {}
    s = _call("POST", "/v2/sessions", {"consentId": consent_id, "format": "json", "dataRange": rng})
    deadline = time.time() + _POLL_SECONDS
    while True:
        session = _call("GET", f"/v2/sessions/{s['id']}")
        st = session.get("status")
        if st in ("COMPLETED", "PARTIAL"):
            return normalize(session)
        if st in ("FAILED", "EXPIRED"):
            raise AAError("Your bank could not share the data. Please try again.", 502)
        if time.time() > deadline:
            raise AAError("Your bank is taking too long to respond. Please try again in a minute.", 504)
        time.sleep(1.5)
