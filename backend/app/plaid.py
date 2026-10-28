"""Plaid over plain REST: link token, public-token exchange, then accounts + transactions mapped to our rows.

The access token is used once to import and is never stored, so there is no Plaid secret in the database.
Plaid only covers banks in the US, Canada and Europe; Indian banks go through Account Aggregator (app/aa).
"""
from __future__ import annotations

import os
import time
from datetime import date

import httpx

from app.ingest.categorize import categorize
from app.models import AccountRow, TransactionRow


class PlaidError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def enabled() -> bool:
    return bool(os.getenv("PLAID_CLIENT_ID") and os.getenv("PLAID_SECRET"))


def _post(path: str, body: dict) -> dict:
    if not enabled():
        raise PlaidError("Plaid isn't configured (set PLAID_CLIENT_ID and PLAID_SECRET).", 503)
    env = os.getenv("PLAID_ENV", "sandbox")
    try:
        r = httpx.post(f"https://{env}.plaid.com{path}", json={"client_id": os.environ["PLAID_CLIENT_ID"], "secret": os.environ["PLAID_SECRET"], **body}, timeout=30)
    except httpx.HTTPError as exc:
        raise PlaidError("Couldn't reach Plaid. Try again in a moment.") from exc
    if r.status_code >= 400:
        err = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        raise PlaidError(err.get("error_message") or f"Plaid returned {r.status_code}", 502 if err.get("error_code") != "PRODUCT_NOT_READY" else 425)
    return r.json()


def link_token(user_id: str) -> str:
    return _post("/link/token/create", {
        "client_name": "FinPilot", "user": {"client_user_id": user_id}, "products": ["transactions"], "language": "en",
        "country_codes": os.getenv("PLAID_COUNTRIES", "US").split(","),
    })["link_token"]


def exchange(public_token: str) -> str:
    return _post("/item/public_token/exchange", {"public_token": public_token})["access_token"]


def fetch(access_token: str) -> tuple[list[dict], list[dict]]:
    """(accounts, settled transactions). Right after linking, Plaid is still pulling history, so retry a few seconds."""
    accounts = _post("/accounts/get", {"access_token": access_token})["accounts"]
    txns: list[dict] = []
    cursor = ""
    for attempt in range(12):
        try:
            while True:
                page = _post("/transactions/sync", {"access_token": access_token, "cursor": cursor, "count": 500})
                txns += page["added"]
                cursor = page["next_cursor"]
                if not page["has_more"]:
                    return accounts, [t for t in txns if not t.get("pending")]
        except PlaidError as e:
            if e.status != 425 or attempt == 11:
                raise PlaidError("Plaid is still preparing your transactions. Try again in a minute.", 425) if e.status == 425 else e
            time.sleep(1.5)
    return accounts, txns


_KIND = {"credit": "credit_card", "loan": "loan", "investment": "investment"}


def to_rows(user_id: str, accounts: list[dict], txns: list[dict]) -> tuple[list[AccountRow], list[TransactionRow]]:
    rows: list[AccountRow] = []
    for a in accounts:
        kind = _KIND.get(a["type"]) or ("savings" if a.get("subtype") in ("savings", "cd", "money market") else "checking")
        owed = kind in ("credit_card", "loan")  # Plaid reports what you owe as a positive number; we store debts as negative
        current = float(a["balances"].get("current") or 0)
        rows.append(AccountRow(id=f"{user_id}-plaid-{a['account_id']}", user_id=user_id, name=f"{a['name']} {a.get('mask') or ''}".strip(), type=kind,
                               balance=-current if owed else current, credit_limit=a["balances"].get("limit"),
                               currency=a["balances"].get("iso_currency_code") or "USD"))
    ids = {a["account_id"] for a in accounts}
    out = []
    for t in txns:
        if t["account_id"] not in ids:
            continue
        merchant = (t.get("merchant_name") or t["name"])[:60]
        amount = -float(t["amount"])  # Plaid: positive = money out; ours: negative = money out
        out.append(TransactionRow(id=f"{user_id}-plaid-{t['transaction_id']}", user_id=user_id, account_id=f"{user_id}-plaid-{t['account_id']}",
                                  date=date.fromisoformat(t["date"]), amount=amount, merchant=merchant, category=categorize(merchant, amount).value, description=t["name"]))
    return rows, out
