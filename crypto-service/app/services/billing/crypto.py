"""Crypto invoices for the Cake Wallet flow. TESTNET/SIGNET ONLY; this app never holds keys.

BTC: amount = pack price x BTC_SATS_PER_USD + an invoice-specific 1..999 sats, so each payment can be
matched by exact amount at the public receive address. Confirmation is read from an Esplora-style
explorer API (`/address/{addr}/txs`, `/blocks/tip/height`, as served by mempool.space and
blockstream.info). XMR: payment URI only (`provider: "demo"`); there is no automatic confirmation
(that would need a view key / wallet RPC), an admin can mark a demo invoice paid.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import httpx

from app.config import Pack, Settings
from app.db.base import Database
from app.db.models import Invoice
from app.errors import ApiError, UpstreamError
from app.logging_setup import log
from app.services.address import is_valid_address
from app.services.billing import ledger

POLL_MIN_INTERVAL_S = 10
MAX_OPEN_INVOICES_PER_SESSION = 5
XMR_DEMO_PICONERO_PER_CREDIT = 10_000_000_000  # 0.01 XMR per credit, demo only (no real pricing)


@dataclass
class TxMatch:
    txid: str
    confirmations: int


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def btc_amount_str(sats: int) -> str:
    return f"{sats / 100_000_000:.8f}"


class CryptoInvoices:
    def __init__(self, settings: Settings, db: Database, http: httpx.AsyncClient) -> None:
        self.s = settings
        self.db = db
        self.http = http

    def _btc_ready(self) -> bool:
        a = self.s.btc_receive_address
        return bool(a and self.s.btc_sats_per_usd > 0 and self.s.btc_explorer_base_url
                    and is_valid_address(a, network="testnet"))

    def _btc_sats(self, pack: Pack) -> int:
        # invoice-specific offset (1..btc_offset_space sats): a wide space keeps open invoices from exhausting it
        return round(pack.price_usd * self.s.btc_sats_per_usd) + secrets.randbelow(self.s.btc_offset_space) + 1

    def create(self, session_id: str, pack: Pack, coin: Literal["btc", "xmr"],
               client_ip: str | None = None) -> Invoice:
        now = datetime.now(UTC)
        inv_id = "inv_" + secrets.token_hex(10)
        client_hash = None
        if client_ip:
            client_hash = hashlib.sha256(f"{self.s.log_salt.get_secret_value()}|{client_ip}".encode()).hexdigest()[:32]
        if coin == "btc":
            if not self._btc_ready():
                raise ApiError(503, "crypto_unavailable")
            sats = self._btc_sats(pack)
            addr = self.s.btc_receive_address
            amount = btc_amount_str(sats)
            uri = f"bitcoin:{addr}?amount={amount}&label=Cryptiq%20{pack.id}"
        else:
            if not self.s.xmr_demo_address:
                raise ApiError(503, "crypto_unavailable")
            sats = pack.credits * XMR_DEMO_PICONERO_PER_CREDIT
            addr = self.s.xmr_demo_address
            amount = f"{sats / 1e12:.12f}".rstrip("0").rstrip(".")
            uri = f"monero:{addr}?tx_amount={amount}&tx_description=Cryptiq%20{pack.id}"
        inv = Invoice(id=inv_id, session_id=session_id, pack_id=pack.id, coin=coin, address=addr, amount_atomic=sats,
                      amount=amount, uri=uri, status="waiting", created_at=now, client_hash=client_hash,
                      expires_at=now + timedelta(minutes=self.s.invoice_ttl_minutes))
        with self.db.session() as s:
            ledger.ensure_for_request(s, self.s, session_id)
            # free amounts held by invoices that ran out of time without ever being polled
            for stale in s.query(Invoice).filter(Invoice.status == "waiting", Invoice.expires_at < now):
                stale.status = "expired"
            open_n = s.query(Invoice).filter(Invoice.session_id == session_id, Invoice.status == "waiting").count()
            if open_n >= MAX_OPEN_INVOICES_PER_SESSION:
                raise ApiError(429, "too_many_open_invoices")
            if client_hash is not None:
                # one client cannot hold the whole offset space by minting cookie-less sessions (BUG-045)
                ip_open = s.query(Invoice).filter(Invoice.client_hash == client_hash,
                                                  Invoice.status == "waiting").count()
                if ip_open >= self.s.max_open_invoices_per_ip:
                    raise ApiError(429, "too_many_open_invoices")
            if coin == "btc":
                # amounts must be unique among open invoices at this address: draw a few times before giving up
                for _ in range(5):
                    clash = s.query(Invoice).filter(Invoice.status == "waiting", Invoice.amount_atomic == sats,
                                                    Invoice.coin == "btc").first()
                    if clash is None:
                        break
                    sats = self._btc_sats(pack)
                else:
                    raise ApiError(409, "try_again")
                inv.amount_atomic = sats
                inv.amount = btc_amount_str(sats)
                inv.uri = f"bitcoin:{addr}?amount={inv.amount}&label=Cryptiq%20{pack.id}"
            s.add(inv)
        return inv

    def get(self, invoice_id: str, session_id: str) -> Invoice:
        with self.db.session() as s:
            inv = s.get(Invoice, invoice_id)
            if inv is None or inv.session_id != session_id:
                raise ApiError(404, "not_found")
            s.expunge(inv)
            return inv

    async def refresh(self, invoice_id: str, session_id: str) -> str:
        inv = self.get(invoice_id, session_id)
        if inv.status != "waiting":
            return inv.status
        now = datetime.now(UTC)
        if inv.coin == "btc" and (inv.last_polled_at is None
                                  or (now - _utc(inv.last_polled_at)).total_seconds() >= POLL_MIN_INTERVAL_S):
            try:
                with self.db.session() as s:
                    used = {t for (t,) in s.query(Invoice.txid).filter(Invoice.txid.is_not(None)) if t}
                match = await self.find_payment(inv.address, inv.amount_atomic, _utc(inv.created_at), used)
            except UpstreamError as exc:
                log.warning("explorer_failed", detail=exc.detail)
                match = None
            with self.db.session() as s:
                row = s.get(Invoice, inv.id)
                assert row is not None
                row.last_polled_at = now
            if match is not None and match.confirmations >= self.s.btc_confirmations:
                return self.mark_paid(inv.id, match.txid)
        if now > _utc(inv.expires_at):
            with self.db.session() as s:
                row = s.get(Invoice, inv.id)
                if row is not None and row.status == "waiting":
                    row.status = "expired"
            return "expired"
        return "waiting"

    def mark_paid(self, invoice_id: str, txid: str | None) -> str:
        """Idempotent: credits are added once (ledger ref = invoice id)."""
        with self.db.session() as s:
            row = s.get(Invoice, invoice_id)
            if row is None:
                raise ApiError(404, "not_found")
            if row.status == "paid":
                return "paid"
            pack = self.s.pack(row.pack_id)
            if pack is None:
                raise ApiError(409, "unknown_pack")
            row.status = "paid"
            row.txid = txid
            ledger.add_credits(s, row.session_id, pack.credits, "crypto", row.id)
        log.info("invoice_paid", invoice=invoice_id, coin=row.coin)
        return "paid"

    async def find_payment(self, address: str, amount_sats: int, created_at: datetime,
                           used_txids: set[str] | None = None) -> TxMatch | None:
        base = self.s.btc_explorer_base_url.rstrip("/")
        try:
            txs_r = await self.http.get(f"{base}/address/{address}/txs", timeout=8.0)
            txs_r.raise_for_status()
            txs: Any = txs_r.json()
            tip_r = await self.http.get(f"{base}/blocks/tip/height", timeout=8.0)
            tip_r.raise_for_status()
            tip = int(tip_r.text.strip())
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamError("explorer", type(exc).__name__) from exc
        if not isinstance(txs, list):  # e.g. an error object served with HTTP 200
            raise UpstreamError("explorer", "unexpected_payload")
        for tx in txs:
            if not isinstance(tx, dict) or not isinstance(tx.get("txid"), str):
                continue  # malformed entry: skip it, never 500 the poll
            if used_txids and tx["txid"] in used_txids:
                continue  # already credited to another invoice with the same amount
            status = tx.get("status")
            status = status if isinstance(status, dict) else {}
            block_time = status.get("block_time")
            if isinstance(block_time, int) and not isinstance(block_time, bool) and \
                    datetime.fromtimestamp(block_time, UTC) < created_at - timedelta(minutes=5):
                continue  # older than the invoice: cannot be its payment
            vouts = tx.get("vout")
            for out in vouts if isinstance(vouts, list) else []:
                if not isinstance(out, dict):
                    continue
                value = out.get("value")
                if out.get("scriptpubkey_address") == address and isinstance(value, int) and value == amount_sats:
                    height = status.get("block_height")
                    confirmed = status.get("confirmed") is True and isinstance(height, int) and height <= tip
                    return TxMatch(tx["txid"], tip - height + 1 if confirmed else 0)
        return None
