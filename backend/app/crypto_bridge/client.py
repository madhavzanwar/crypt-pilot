"""STUB (owner: bridge-backend agent overwrites this file).

Contract used by the councils: `check_wallet` returns the crypto service's /api/check JSON for one address, or None when the
service is not configured / unreachable. It must never raise.
"""
from __future__ import annotations

from typing import Any


async def check_wallet(address: str, lang: str = "en") -> dict[str, Any] | None:
    return None
