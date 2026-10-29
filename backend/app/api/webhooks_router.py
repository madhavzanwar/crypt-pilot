"""Receives Setu status-page notices (Instatus webhooks: incidents, maintenance) so we can see when their sandbox is degraded."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()
log = logging.getLogger("finpilot.webhooks")


def _signature_ok(raw: bytes, signature: str, secret: str) -> bool:
    # Instatus signs JSON.stringify(parsedBody): compact JSON. Raw bytes are accepted too, in case the sender sends compact JSON.
    candidates = [raw]
    try:
        candidates.append(json.dumps(json.loads(raw), separators=(",", ":"), ensure_ascii=False).encode())
    except ValueError:
        pass
    return any(hmac.compare_digest(hmac.new(secret.encode(), c, hashlib.sha256).hexdigest(), signature) for c in candidates)


@router.post("/webhooks/setu-status")
async def setu_status(request: Request) -> dict:
    raw = await request.body()
    secret = os.getenv("SETU_STATUS_WEBHOOK_SECRET")
    if secret:  # without a secret configured the notice is only logged, never trusted
        sig = request.headers.get("x-instatus-webhook-signature")
        if not sig:
            raise HTTPException(400, "Signature missing")
        if not _signature_ok(raw, sig, secret):
            raise HTTPException(401, "Invalid signature")
    # Never log the body: without a configured secret anyone can post here, so it would be attacker-controlled log content.
    log.warning("setu status notice received (%d bytes, signature %s)", len(raw), "verified" if secret else "not checked: secret unset")
    return {"ok": True}
