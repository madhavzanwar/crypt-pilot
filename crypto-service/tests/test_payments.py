from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db.models import Invoice
from app.services.address import segwit_encode
from app.services.billing.webhook_verify import WebhookVerificationError, sign, verify

# Vector produced by the official `standardwebhooks` 1.1.0 library (Webhook(secret).sign(...)).
SW_SECRET = "whsec_Y3J5cHRpcS10ZXN0LXNlY3JldC1ub3QtcmVhbC0wMDAx"
SW_ID, SW_TS = "msg_test_1", 1793180000
SW_BODY = b'{"type":"payment.succeeded","data":{"payment_id":"pay_test_1"}}'
SW_SIG = "v1,BVhAy4+B46bhijXH5xK5NV3MoreGd8T9J2lW86jOKsY="

TB_ADDR = segwit_encode("tb", 0, bytes(range(20)))  # synthetic testnet address (no keys exist for it)
PACKS = json.dumps([{"id": "starter", "credits": 5, "priceUsd": 1, "label": "Starter", "dodoProductId": "pdt_test"}])


def test_signature_matches_reference_library() -> None:
    assert sign(SW_SECRET, SW_ID, SW_TS, SW_BODY) == SW_SIG
    headers = {"webhook-id": SW_ID, "webhook-timestamp": str(SW_TS), "webhook-signature": f"v0,xyz {SW_SIG}"}
    assert verify(SW_SECRET, headers, SW_BODY, now=SW_TS + 10) == SW_ID


@pytest.mark.parametrize(("mutate", "now"), [
    (lambda h, b: (h | {"webhook-signature": "v1,AAAA"}, b), SW_TS),
    (lambda h, b: (h, b + b" "), SW_TS),                       # body tampered
    (lambda h, b: (h | {"webhook-id": "msg_other"}, b), SW_TS),
    (lambda h, b: (h, b), SW_TS + 3600),                       # stale
    (lambda h, b: ({k: v for k, v in h.items() if k != "webhook-id"}, b), SW_TS),
])
def test_signature_rejections(mutate: Any, now: int) -> None:
    h = {"webhook-id": SW_ID, "webhook-timestamp": str(SW_TS), "webhook-signature": SW_SIG}
    h2, b2 = mutate(h, SW_BODY)
    with pytest.raises(WebhookVerificationError):
        verify(SW_SECRET, h2, b2, now=now)


def client_with(settings: Any, handler: Any = None, **kw: Any) -> TestClient:
    from app.main import build_state, create_app

    s = type(settings)(_env_file=None, **{**settings.model_dump(), "packs_json": PACKS, **kw})
    st = build_state(s)
    if handler is not None:
        st.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    c = TestClient(create_app(s, st))
    c.__enter__()
    return c


def signed_post(c: TestClient, event_id: str, payload: dict[str, Any]) -> httpx.Response:
    body = json.dumps(payload).encode()
    ts = int(time.time())
    return c.post("/api/webhooks/dodo", content=body, headers={
        "webhook-id": event_id, "webhook-timestamp": str(ts), "webhook-signature": sign(SW_SECRET, event_id, ts, body),
        "content-type": "application/json"})


def test_credits_endpoint(settings: Any) -> None:
    c = client_with(settings)
    body = c.get("/api/credits").json()
    assert body == {"balance": 3, "packs": [{"id": "starter", "credits": 5, "priceUsd": 1.0, "label": "Starter"}]}


def test_checkout_unconfigured_and_configured(settings: Any) -> None:
    assert client_with(settings).post("/api/checkout", json={"packId": "starter"}).json() == {"error": "payments_unavailable"}
    seen: dict[str, Any] = {}

    def dodo(req: httpx.Request) -> httpx.Response:
        assert req.url.host == "test.dodopayments.com" and req.url.path == "/checkouts"
        assert req.headers["authorization"] == "Bearer test_key"
        seen.update(json.loads(req.content))
        return httpx.Response(200, json={"session_id": "cks_1", "checkout_url": "https://test.checkout.dodopayments.com/x"})

    c = client_with(settings, dodo, dodo_api_key="test_key")
    assert c.post("/api/checkout", json={"packId": "starter"}).json() == {"url": "https://test.checkout.dodopayments.com/x"}
    assert seen["product_cart"] == [{"product_id": "pdt_test", "quantity": 1}]
    assert seen["metadata"]["pack_id"] == "starter" and seen["metadata"]["session_id"]
    assert seen["return_url"].endswith("/credits/success")
    assert c.post("/api/checkout", json={"packId": "nope"}).status_code == 404


def test_webhook_credits_once(settings: Any) -> None:
    c = client_with(settings, dodo_webhook_secret=SW_SECRET)
    assert c.get("/api/credits").json()["balance"] == 3
    sid = c.cookies.get("cryptiq_sid").rsplit(".", 1)[0]  # type: ignore[union-attr]
    event = {"type": "payment.succeeded", "data": {"payment_id": "pay_1", "metadata": {"session_id": sid, "pack_id": "starter"},
                                                   "customer": {"customer_id": "cus_1"}}}
    assert signed_post(c, "evt_1", event).json() == {"ok": True}
    assert signed_post(c, "evt_1", event).json() == {"ok": True, "duplicate": True}  # replayed delivery
    assert signed_post(c, "evt_2", event).json() == {"ok": True}  # new event id, same payment: still once
    assert c.get("/api/credits").json()["balance"] == 8
    bad = c.post("/api/webhooks/dodo", content=b"{}", headers={"webhook-id": "x", "webhook-timestamp": str(int(time.time())),
                                                               "webhook-signature": "v1,AAAA"})
    assert bad.status_code == 401 and bad.json() == {"error": "invalid_signature"}


def explorer(amount_box: dict[str, int], confirmed: bool = True) -> Any:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/blocks/tip/height"):
            return httpx.Response(200, text="1000")
        assert req.url.path.endswith(f"/address/{TB_ADDR}/txs")
        txs = [{"txid": "ab" * 32, "status": {"confirmed": confirmed, "block_height": 1000, "block_time": int(time.time())},
                "vout": [{"scriptpubkey_address": TB_ADDR, "value": amount_box.get("sats", -1)}]}]
        return httpx.Response(200, json=txs)
    return handler


def test_btc_invoice_paid_once(settings: Any) -> None:
    box: dict[str, int] = {}
    c = client_with(settings, explorer(box), btc_receive_address=TB_ADDR, btc_sats_per_usd=1000,
                    btc_explorer_base_url="https://explorer.test/api", btc_confirmations=1)
    inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json()
    assert inv["uri"].startswith(f"bitcoin:{TB_ADDR}?amount=0.0000") and inv["provider"] == "explorer"
    assert c.get(f"/api/crypto-invoice/{inv['invoiceId']}").json() == {"status": "waiting"}  # no matching tx yet
    db = c.app.state.cryptiq.db
    with db.session() as s:
        row = s.get(Invoice, inv["invoiceId"])
        box["sats"] = row.amount_atomic
        assert 1001 <= row.amount_atomic <= 1999  # base + unique 1..999 sats
        row.last_polled_at = None
    assert c.get(f"/api/crypto-invoice/{inv['invoiceId']}").json() == {"status": "paid"}
    assert c.get(f"/api/crypto-invoice/{inv['invoiceId']}").json() == {"status": "paid"}
    assert c.get("/api/credits").json()["balance"] == 8


def test_btc_invoice_needs_confirmations_and_expires(settings: Any) -> None:
    box: dict[str, int] = {}
    c = client_with(settings, explorer(box, confirmed=False), btc_receive_address=TB_ADDR, btc_sats_per_usd=1000,
                    btc_explorer_base_url="https://explorer.test/api", btc_confirmations=1)
    inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json()
    with c.app.state.cryptiq.db.session() as s:
        row = s.get(Invoice, inv["invoiceId"])
        box["sats"] = row.amount_atomic
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    assert c.get(f"/api/crypto-invoice/{inv['invoiceId']}").json() == {"status": "expired"}  # 0 conf < 1 required
    assert c.get("/api/credits").json()["balance"] == 3


def test_btc_requires_testnet_address(settings: Any) -> None:
    c = client_with(settings, btc_receive_address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", btc_sats_per_usd=1000,
                    btc_explorer_base_url="https://explorer.test/api")
    assert c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"}).json() == {"error": "crypto_unavailable"}


def test_xmr_demo_and_admin(settings: Any) -> None:
    c = client_with(settings, xmr_demo_address="4DEMOxmrADDRESSnotREAL")
    inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "xmr"}).json()
    assert inv["uri"].startswith("monero:4DEMOxmrADDRESSnotREAL?tx_amount=0.05") and inv["provider"] == "demo"
    url = f"/api/admin/crypto-invoice/{inv['invoiceId']}/mark-paid"
    assert c.post(url, headers={"x-admin-token": "wrong"}).status_code == 403
    assert c.post(url, headers={"x-admin-token": "admin-test-token"}).json() == {"status": "paid"}
    assert c.post(url, headers={"x-admin-token": "admin-test-token"}).json() == {"status": "paid"}
    assert c.get("/api/credits").json()["balance"] == 8


def test_invoice_is_private_to_its_session(settings: Any) -> None:
    c = client_with(settings, xmr_demo_address="4DEMOxmr")
    inv = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "xmr"}).json()
    other = client_with(settings, xmr_demo_address="4DEMOxmr")
    assert other.get(f"/api/crypto-invoice/{inv['invoiceId']}").status_code == 404
