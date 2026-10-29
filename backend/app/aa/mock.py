"""A spec-shaped stand-in for an Account Aggregator and its banks (FIPs). Demo only: OTP is always 123456."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.aa import AAError
from app.ingest.personas import PERSONA_CONFIGS, generate_persona

DEMO_OTP = "123456"
PROFILES = {"priya": "demo-priya", "arjun": "demo-arjun", "meera": "demo-meera"}
_MOBILE = re.compile(r"^[6-9]\d{9}$")
_HANDLE_TTL, _CONSENT_TTL = 15 * 60, 24 * 3600
_SECRET = os.getenv("AA_MOCK_SECRET", "finpilot-mock-aa").encode()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]}"


def _verify(token: str, typ: str) -> dict:
    body, _, sig = (token or "").partition(".")
    if not body or not hmac.compare_digest(sig, hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]):
        raise AAError("This consent is not valid. Start again.", 400)
    payload = json.loads(_unb64(body))
    if payload.get("typ") != typ:
        raise AAError("This consent is not valid. Start again.", 400)
    if payload["exp"] < time.time():
        raise AAError("This consent has expired. Start again.", 410)
    return payload


def create_consent(mobile: str, profile: str, months: int, uid: str = "") -> dict:
    """POST /Consent: ask for `months` of deposit-account data. Returns a handle in PENDING state."""
    if not _MOBILE.match(mobile or ""):
        raise AAError("Enter the 10-digit mobile number linked to your bank accounts.", 422)
    if profile not in PROFILES:
        raise AAError("Unknown sample profile.", 422)
    if not 1 <= months <= 24:
        raise AAError("Choose between 1 and 24 months of history.", 422)
    handle = _sign({"typ": "handle", "mobile": mobile, "profile": profile, "months": months, "uid": uid, "exp": time.time() + _HANDLE_TTL})
    return {"handle": handle, "status": "PENDING", "fi_types": ["DEPOSIT"], "months": months}


def approve(handle: str, otp: str) -> dict:
    """The user approves in the AA app with an OTP; the consent becomes ACTIVE."""
    h = _verify(handle, "handle")
    if (otp or "").strip() != DEMO_OTP:
        raise AAError("That OTP is not correct. Try again.", 400)
    consent = _sign({**h, "typ": "consent", "exp": time.time() + _CONSENT_TTL})
    return {"consent_id": consent, "status": "ACTIVE"}


def owner(token: str, typ: str) -> str:
    """The user id a handle / consent was issued to ("" when issued without one)."""
    return _verify(token, typ).get("uid", "")


def _fi_deposit(acc, txns, mobile: str, name: str, start: date, end: date) -> dict:
    """One bank account in the Reserve Bank's FI 'deposit' shape."""
    bal = acc.balance - sum(t.amount for t in txns if t.date > end)
    rows = []
    for t in sorted(txns, key=lambda t: t.date):
        bal += t.amount
        rows.append({
            "txnId": t.id, "type": "CREDIT" if t.amount > 0 else "DEBIT", "mode": "UPI",
            "amount": f"{abs(t.amount):.2f}", "currentBalance": f"{bal:.2f}",
            "transactionTimestamp": datetime(t.date.year, t.date.month, t.date.day, 12, tzinfo=timezone.utc).isoformat(),
            "valueDate": t.date.isoformat(), "narration": f"UPI/{t.merchant}/{t.id[:8]}", "reference": t.id[:12],
        })
    return {
        "type": "deposit", "version": "1.1", "linkedAccRef": acc.id, "maskedAccNumber": f"XXXXXX{int(hashlib.sha1(acc.id.encode()).hexdigest(), 16) % 10000:04d}",
        "profile": {"holders": {"type": "SINGLE", "holder": {"name": name, "mobile": mobile}}},
        "summary": {"currentBalance": f"{acc.balance:.2f}", "type": acc.type.upper(), "branch": "Mock Bank", "status": "ACTIVE", "ifscCode": "MOCK0000001"},
        "transactions": {"startDate": start.isoformat(), "endDate": end.isoformat(), "transaction": rows},
    }


def fetch(consent_id: str, fiu_public_key: str) -> dict:
    """FI request + fetch in one step: the data comes back encrypted for the caller's public key."""
    c = _verify(consent_id, "consent")
    data = generate_persona(replace(PERSONA_CONFIGS[PROFILES[c["profile"]]], user_id="aa-mock"))
    end = date.today()
    start = end - timedelta(days=30 * c["months"])
    accounts = []
    for acc in data.accounts:
        if acc.type not in ("checking", "savings"):
            continue  # the consent covers DEPOSIT accounts only
        mine = [t for t in data.transactions if t.account_id == acc.id and start <= t.date <= end]
        accounts.append({"fipId": "MOCK-BANK", "linkedAccRef": acc.id, "data": _fi_deposit(acc, mine, c["mobile"], c["profile"].title(), start, end)})
    try:
        peer = X25519PublicKey.from_public_bytes(_unb64(fiu_public_key))
    except Exception as exc:  # noqa: BLE001
        raise AAError("The data request was malformed.", 400) from exc
    priv = X25519PrivateKey.generate()
    nonce = os.urandom(12)
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=nonce, info=b"finpilot-aa").derive(priv.exchange(peer))
    blob = AESGCM(key).encrypt(nonce, json.dumps({"accounts": accounts}).encode(), None)
    return {"aaPublicKey": _b64(priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)), "nonce": _b64(nonce), "encryptedFI": _b64(blob)}


def new_keypair() -> tuple[X25519PrivateKey, str]:
    """The FIU's one-time key pair for a data request."""
    priv = X25519PrivateKey.generate()
    return priv, _b64(priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw))


def decrypt(priv: X25519PrivateKey, response: dict) -> dict:
    try:
        nonce = _unb64(response["nonce"])
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=nonce, info=b"finpilot-aa").derive(
            priv.exchange(X25519PublicKey.from_public_bytes(_unb64(response["aaPublicKey"]))))
        return json.loads(AESGCM(key).decrypt(nonce, _unb64(response["encryptedFI"]), None))
    except Exception as exc:  # noqa: BLE001
        raise AAError("Could not read the data from your bank. Please try again.", 502) from exc
