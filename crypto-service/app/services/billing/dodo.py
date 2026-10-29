"""Dodo Payments client (test mode only) over httpx. Endpoints per the official dodopayments SDK
(1.124.0): POST /checkouts -> {session_id, checkout_url}; POST /events/ingest (usage)."""

from __future__ import annotations

from typing import Any

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import Pack, Settings
from app.errors import UpstreamError

BASE_URLS = {"test_mode": "https://test.dodopayments.com", "live_mode": "https://live.dodopayments.com"}


class DodoClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self.s = settings
        self.http = http
        self.base = BASE_URLS[settings.dodo_env]

    @property
    def configured(self) -> bool:
        return bool(self.s.dodo_api_key.get_secret_value())

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        headers = {"authorization": f"Bearer {self.s.dodo_api_key.get_secret_value()}"}
        try:
            async for attempt in AsyncRetrying(stop=stop_after_attempt(2), wait=wait_exponential(min=0.5, max=2),
                                               retry=retry_if_exception_type(httpx.TransportError), reraise=True):
                with attempt:
                    r = await self.http.post(self.base + path, json=body, headers=headers, timeout=10.0)
            r.raise_for_status()
            data: dict[str, Any] = r.json()
        except httpx.HTTPStatusError as exc:
            raise UpstreamError("dodo", f"http {exc.response.status_code}") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamError("dodo", type(exc).__name__) from exc
        return data

    async def create_checkout(self, pack: Pack, session_id: str) -> str:
        if not pack.dodo_product_id:
            raise UpstreamError("dodo", "pack has no dodoProductId")
        data = await self._post("/checkouts", {
            "product_cart": [{"product_id": pack.dodo_product_id, "quantity": 1}],
            "metadata": {"session_id": session_id, "pack_id": pack.id},
            "return_url": f"{self.s.frontend_url.rstrip('/')}/credits/success",
        })
        url = data.get("checkout_url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise UpstreamError("dodo", "no checkout_url in response")
        return url

    async def report_usage(self, customer_id: str, event_id: str) -> None:
        if not self.s.dodo_usage_meter_event:
            return
        await self._post("/events/ingest", {"events": [{
            "customer_id": customer_id, "event_id": event_id, "event_name": self.s.dodo_usage_meter_event,
            "metadata": {"credits": 1}}]})


def payment_fields(event: dict[str, Any]) -> tuple[str | None, str | None, str | None, str | None]:
    """(payment_id, session_id, pack_id, customer_id) from a payment.succeeded payload."""
    def obj(v: Any) -> dict[str, Any]:
        return v if isinstance(v, dict) else {}

    def text(v: Any) -> str | None:
        return v if isinstance(v, str) else None

    data = obj(event.get("data"))
    meta = obj(data.get("metadata"))
    customer = obj(data.get("customer"))
    return (text(data.get("payment_id")), text(meta.get("session_id")), text(meta.get("pack_id")),
            text(customer.get("customer_id")))


def pack_mismatch(event: dict[str, Any], pack: Pack) -> str | None:
    """Reason the payment does not correspond to `pack`, or None. Only fields Dodo actually sent are checked:
    the product in `product_cart` must include the pack's product id, and a USD `total_amount` (cents, may
    include tax) must not be below the pack price."""
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    cart = data.get("product_cart")
    if isinstance(cart, list) and cart and pack.dodo_product_id:
        ids = {c.get("product_id") for c in cart if isinstance(c, dict)}
        if pack.dodo_product_id not in ids:
            return "product_mismatch"
    total = data.get("total_amount")
    cur = data.get("currency")
    usd = isinstance(cur, str) and cur.upper() == "USD"
    if usd and isinstance(total, int) and not isinstance(total, bool) and total < round(pack.price_usd * 100):
        return "amount_too_low"
    return None
