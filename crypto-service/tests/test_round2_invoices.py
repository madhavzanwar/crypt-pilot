"""BUG-044 (malformed explorer payloads) and BUG-045 (invoice slot exhaustion)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.db.models import Invoice
from tests.test_payments import TB_ADDR, client_with

KW = dict(btc_receive_address=TB_ADDR, btc_sats_per_usd=1000, btc_explorer_base_url="https://explorer.test/api",
          btc_confirmations=0)


def _explorer(txs: Any, tip: str = "1000") -> Any:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/blocks/tip/height"):
            return httpx.Response(200, text=tip)
        return httpx.Response(200, json=txs)
    return handler


def _invoice(c: Any) -> tuple[str, int]:
    inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json()
    with c.app.state.cryptiq.db.session() as s:
        row = s.get(Invoice, inv["invoiceId"])
        row.last_polled_at = None
        return inv["invoiceId"], row.amount_atomic


@pytest.mark.parametrize("payload", [
    {"error": "rate limited"}, "oops", None, 5,
    [None, 5, "x", {"txid": 7}, {"txid": "t", "status": "confirmed", "vout": "x"}, {"txid": "u", "vout": [None, 3]}],
])
def test_malformed_explorer_payload_is_never_500(settings: Any, payload: Any) -> None:
    c = client_with(settings, _explorer(payload), **KW)
    iid, _ = _invoice(c)
    r = c.get(f"/api/crypto-invoice/{iid}")
    assert r.status_code == 200 and r.json() == {"status": "waiting"}


def test_confirmed_tx_without_block_height_counts_as_unconfirmed(settings: Any) -> None:
    c = client_with(settings, None, **{**KW, "btc_confirmations": 1})
    iid, sats = _invoice(c)
    tx = [{"txid": "cd" * 32, "status": {"confirmed": True}, "vout": [{"scriptpubkey_address": TB_ADDR, "value": sats}]}]
    c.app.state.cryptiq.http = httpx.AsyncClient(transport=httpx.MockTransport(_explorer(tx)))
    r = c.get(f"/api/crypto-invoice/{iid}")
    assert r.status_code == 200 and r.json() == {"status": "waiting"}


def test_per_ip_open_invoice_cap_blocks_cookie_dropping(settings: Any) -> None:
    c = client_with(settings, None, max_open_invoices_per_ip=7, **KW)
    codes = []
    for _ in range(10):
        c.cookies.clear()  # a fresh cookie-less session every time
        codes.append(c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).status_code)
    assert codes[:7] == [200] * 7 and set(codes[7:]) == {429}


def test_clash_is_redrawn_not_409(settings: Any) -> None:
    c = client_with(settings, None, **KW)
    import secrets
    seq = iter([5, 5, 5, 9])  # offset 6 is taken by the first invoice; the next draws repeat it, then 10
    real = secrets.randbelow
    secrets.randbelow = lambda n: next(seq)  # type: ignore[assignment]
    try:
        a = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"})
        c.cookies.clear()
        b = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"})
    finally:
        secrets.randbelow = real  # type: ignore[assignment]
    assert a.status_code == 200 and b.status_code == 200 and a.json()["amount"] != b.json()["amount"]
    assert b.json()["uri"].split("amount=")[1].split("&")[0] == b.json()["amount"]
