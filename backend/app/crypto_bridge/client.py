"""Server-side client used by the councils: ask the crypto service to check one wallet.

Contract: `check_wallet` returns the crypto service's /api/check JSON for one address, or None when the service is not
configured / unreachable / answers anything but 200. It never raises. It uses its own cookie-less session (the service
hands out a fresh anonymous session, so it never touches a visitor's credits).
"""
from __future__ import annotations

from typing import Any

from app.crypto_bridge import upstream

_COUNCIL_TIMEOUT = 30.0


async def check_wallet(address: str, lang: str = "en") -> dict[str, Any] | None:
    try:
        if not upstream.is_configured():
            return None
        addr = (address or "").strip()
        if not addr:
            return None
        payload = {"address": addr, "lang": lang if lang in ("en", "hi") else "en"}
        async with upstream.new_client(_COUNCIL_TIMEOUT) as client:
            resp = await client.post("/api/check", json=payload)
        if resp.status_code != 200:
            upstream.log.info("check_wallet: upstream status %s", resp.status_code)
            return None
        data = upstream.json_or_none(resp)
        return data if isinstance(data, dict) else None
    except Exception as exc:  # noqa: BLE001 - the contract is "never raise"
        try:
            upstream.log.warning("check_wallet failed: %s", upstream.error_summary(exc))
        except Exception:  # noqa: BLE001
            pass
        return None
