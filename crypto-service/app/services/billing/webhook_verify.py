"""Standard Webhooks signature verification (the scheme Dodo Payments uses).

signed content = f"{webhook-id}.{webhook-timestamp}.{raw body}", HMAC-SHA256 with the base64 secret
after the "whsec_" prefix; header `webhook-signature` holds space-separated "v1,<base64>" entries.
Tested against a vector produced by the official `standardwebhooks` library.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from collections.abc import Mapping

TOLERANCE_S = 5 * 60


class WebhookVerificationError(Exception):
    pass


def _key(secret: str) -> bytes:
    raw = secret.removeprefix("whsec_")
    try:
        return base64.b64decode(raw, validate=True)
    except ValueError as exc:
        raise WebhookVerificationError("bad secret") from exc


def sign(secret: str, msg_id: str, timestamp: int, body: bytes) -> str:
    content = f"{msg_id}.{timestamp}.".encode() + body
    return "v1," + base64.b64encode(hmac.new(_key(secret), content, hashlib.sha256).digest()).decode()


def verify(secret: str, headers: Mapping[str, str], body: bytes, now: float | None = None) -> str:
    """Return the webhook id if valid; raise WebhookVerificationError otherwise."""
    if not secret:
        raise WebhookVerificationError("no secret configured")
    msg_id = headers.get("webhook-id", "")
    ts_raw = headers.get("webhook-timestamp", "")
    sigs = headers.get("webhook-signature", "")
    if not msg_id or not (ts_raw.isascii() and ts_raw.isdigit()) or not sigs:
        raise WebhookVerificationError("missing headers")
    ts = int(ts_raw)
    if abs((now if now is not None else time.time()) - ts) > TOLERANCE_S:
        raise WebhookVerificationError("stale timestamp")
    expected = sign(secret, msg_id, ts, body).split(",", 1)[1]
    for part in sigs.split():
        version, _, sig = part.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return msg_id
    raise WebhookVerificationError("signature mismatch")
