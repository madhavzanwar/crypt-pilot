"""Data connectors: the app starts empty and fills itself when a source is linked.

Bank / invoice / investment connectors link demo datasets from backend/data/connectors/.
"Payment rails" (Dodo Payments, Cake Wallet) are not data sources: they are always available, test mode / testnet only,
and open the credits drawer in the UI. The retired Google Pay connector is no longer listed; its id is still accepted by
the connect/disconnect/export routes (LEGACY_IDS) because the Account Aggregator flow and the plan seeding record that link.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core import store
from app.core.auth import DEMO_USER_IDS, resolve_user_id
from app.ingest.personas import PERSONA_CONFIGS, generate_persona
from app.ingest.seed import _clear_user
from app.ingest.upload import parse_transaction_csv
from app.models import AccountRow, ConnectionRow, InsightsSnapshotRow, TransactionRow

router = APIRouter(prefix="/api/connectors", tags=["connectors"])

# id -> (name, description, live?)
CATALOG: dict[str, tuple[str, str, bool]] = {
    "bank": ("Bank accounts", "Balances, salary credits, loans and cards", True),
    "google_sheets": ("Google Sheets", "A live expense sheet: edit it and the app updates", True),
    "invoices": ("Gmail & Drive invoices", "Bills and invoices parsed automatically", True),
    "investments": ("Mutual funds & stocks", "SIPs and holdings from your depository", True),
    "plaid": ("Plaid", "Link a US or European bank (sandbox) to import accounts and transactions", True),
    "dodo": ("Dodo Payments", "Card checkout for CryptPilot credits. Test mode, no real charge", True),
    "cake_wallet": ("Cake Wallet", "Bitcoin testnet / Monero demo invoices, opened as a bitcoin: or monero: link in your wallet", True),
}

# Payment rails: always "connected" (available), carry no user data, and never touch the ledger.
RAILS: dict[str, str] = {"dodo": "Test mode", "cake_wallet": "Bitcoin testnet / Monero demo"}

# Retired from the catalogue but still honoured by the routes (existing links, the AA flow and plan seeding use this id).
LEGACY_IDS: dict[str, str] = {"google_pay": "Google Pay"}


def _known(connector: str) -> bool:
    return connector in CATALOG or connector in LEGACY_IDS


def _label(connector: str) -> str:
    return CATALOG[connector][0] if connector in CATALOG else LEGACY_IDS[connector]

# Demo datasets for the bank / invoices / investments connectors, all kept in one folder.
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "connectors"
DATASET_FILES = {"bank": "bank.json", "invoices": "invoices.json", "investments": "investments.json"}


def _dataset(connector: str) -> dict:
    return json.loads((DATA_DIR / DATASET_FILES[connector]).read_text(encoding="utf-8"))


def _to_csv(tables: dict[str, list[dict]]) -> str:
    """One CSV for Excel/Sheets: each table gets its own title line and header, separated by a blank line."""
    out = io.StringIO()
    w = csv.writer(out)
    for i, (name, rows) in enumerate(tables.items()):
        if i:
            w.writerow([])
        if len(tables) > 1:
            w.writerow([name.replace("_", " ").title()])
        cols = list(dict.fromkeys(k for r in rows for k in r))
        w.writerow(cols)
        for r in rows:
            w.writerow([json.dumps(v) if isinstance(v, (list, dict)) else v for v in (r.get(c, "") for c in cols)])
    return out.getvalue()


# Which synthetic profile feeds the dummy Google Pay link.
PROFILES = {"priya": "demo-priya", "arjun": "demo-arjun", "meera": "demo-meera"}


class ConnectRequest(BaseModel):
    profile: str = "priya"
    url: str = ""


class Connector(BaseModel):
    id: str
    name: str
    description: str
    available: bool
    connected: bool
    detail: str | None = None
    connected_at: datetime | None = None


def _clear_sheet(user_id: str) -> None:
    """Demo personas keep their fixture data: only the sheet's own account and rows are replaced."""
    store.delete_where(TransactionRow, user_id=user_id, account_id=f"{user_id}-sheet")
    store.delete(AccountRow, f"{user_id}-sheet")


def _seed_from_persona(user_id: str, profile: str) -> dict[str, int]:
    source = PROFILES.get(profile)
    if source is None:
        raise HTTPException(422, f"Unknown profile '{profile}'")
    _clear_user(user_id)
    data = generate_persona(replace(PERSONA_CONFIGS[source], user_id=user_id))
    store.put(*data.accounts, *data.transactions, *data.debts, *data.incomes,
              *data.rules, *data.budgets, *data.goals)
    return {"accounts": len(data.accounts), "transactions": len(data.transactions)}


_SHEET_RE = re.compile(r"^https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)")


def _sheet_csv_url(url: str) -> str:
    """Only docs.google.com sheet links are accepted (the backend fetches this URL, so no arbitrary hosts)."""
    m = _SHEET_RE.match(url.strip())
    if not m:
        raise HTTPException(422, "Paste a Google Sheets link that starts with https://docs.google.com/spreadsheets/d/")
    gid = re.search(r"[#&?]gid=(\d+)", url)
    return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv&gid={gid.group(1) if gid else 0}"


def _fetch_sheet(url: str, hops: int = 4) -> httpx.Response:
    """GET following redirects manually, only to Google hosts (https), so a redirect can't point at an internal host."""
    for _ in range(hops + 1):
        r = httpx.get(url, follow_redirects=False, timeout=20)
        if not getattr(r, "is_redirect", False):
            return r
        nxt = str(r.next_request.url) if getattr(r, "next_request", None) else ""
        host = httpx.URL(nxt).host if nxt else ""
        if not nxt.startswith("https://") or not (host == "google.com" or host.endswith(".google.com") or host.endswith(".googleusercontent.com")):
            raise HTTPException(502, "The sheet link redirected somewhere that isn't allowed.")
        url = nxt
    raise HTTPException(502, "Too many redirects reading the sheet.")


def _sync_sheet(user_id: str, csv_url: str, last_hash: str | None = None) -> tuple[bool, str, int]:
    """Fetch the sheet, and replace the user's ledger with it when it changed. Returns (changed, hash, rows)."""
    try:
        r = _fetch_sheet(csv_url)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Couldn't read the sheet. In Google Sheets choose Share, then 'Anyone with the link' can view.") from exc
    if "text/csv" not in r.headers.get("content-type", ""):
        raise HTTPException(502, "That link isn't readable as a CSV. Set sharing to 'Anyone with the link' can view.")
    digest = hashlib.sha256(r.content).hexdigest()
    if digest == last_hash:
        return False, digest, 0
    try:
        txns = parse_transaction_csv(r.content, user_id=user_id, account_id=f"{user_id}-sheet")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    _clear_sheet(user_id) if user_id in DEMO_USER_IDS else _clear_user(user_id)
    # balance = everything that came in minus everything that went out, so it can't go negative unless spending beats income
    store.put(AccountRow(id=f"{user_id}-sheet", user_id=user_id, name="Google Sheet", type="checking", balance=round(sum(t.amount for t in txns), 2)), *txns)
    store.delete_where(InsightsSnapshotRow, user_id=user_id)
    return True, digest, len(txns)


@router.get("/{user_id}", response_model=list[Connector])
def list_connectors(user_id: str = Depends(resolve_user_id)) -> list[Connector]:
    linked = {c.connector: c for c in store.query(ConnectionRow, user_id=user_id)}
    out = []
    for cid, (name, desc, live) in CATALOG.items():
        if cid in RAILS:
            out.append(Connector(id=cid, name=name, description=desc, available=live, connected=True, detail=RAILS[cid]))
            continue
        row = linked.get(cid)
        out.append(Connector(id=cid, name=name, description=desc, available=live,
                             connected=row is not None and row.status == "connected",
                             detail=row.detail if row else None,
                             connected_at=row.connected_at if row else None))
    return out


@router.post("/{user_id}/{connector}/connect")
def connect(connector: str, body: ConnectRequest, user_id: str = Depends(resolve_user_id)) -> dict:
    if not _known(connector):
        raise HTTPException(404, "Unknown connector")
    if connector in LEGACY_IDS:
        # retired connector: it is unlisted, so it must not wipe a guest's ledger or re-seed persona data any more
        # (disconnect/export still work for existing links; the AA flow records its own link directly)
        raise HTTPException(410, f"{_label(connector)} has been retired and can no longer be connected")
    if connector in CATALOG and not CATALOG[connector][2]:
        raise HTTPException(409, f"{_label(connector)} isn't available yet")
    if connector in RAILS:
        # nothing to link: the rail is always available (test mode / testnet only)
        return {"connected": True, "rail": True}
    if connector == "google_sheets":
        csv_url = _sheet_csv_url(body.url)
        _, digest, n = _sync_sheet(user_id, csv_url)
        store.put(ConnectionRow(id=f"{user_id}:{connector}", user_id=user_id, connector=connector, detail=f"{n} rows, live",
                                source_url=csv_url, content_hash=digest, connected_at=datetime.now(timezone.utc)))
        return {"connected": True, "transactions": n}
    # dataset-only link (doesn't touch dashboard data), upgrade when a real adapter lands
    stats = {k: len(v) for k, v in _dataset(connector).items()}
    detail = f"{sum(stats.values())} records"
    store.delete_where(InsightsSnapshotRow, user_id=user_id)
    store.put(ConnectionRow(id=f"{user_id}:{connector}", user_id=user_id, connector=connector,
                            detail=detail, connected_at=datetime.now(timezone.utc)))
    return {"connected": True, **stats}


@router.post("/{user_id}/google_sheets/sync")
def sync_sheet(user_id: str = Depends(resolve_user_id)) -> dict:
    """Re-read the linked sheet; the ledger is only replaced when the sheet changed."""
    row = store.get(ConnectionRow, f"{user_id}:google_sheets")
    if row is None or not row.source_url:
        raise HTTPException(409, "Google Sheets isn't connected")
    changed, digest, n = _sync_sheet(user_id, row.source_url, row.content_hash)
    if changed:
        row.content_hash, row.detail = digest, f"{n} rows, live"
        store.put(row)
    return {"changed": changed}


@router.get("/{user_id}/{connector}/export")
def export(connector: str, user_id: str = Depends(resolve_user_id)) -> Response:
    """Download what a connector brought in, as a CSV file."""
    if not _known(connector):
        raise HTTPException(404, "Unknown connector")
    if connector in RAILS:
        raise HTTPException(409, f"{_label(connector)} is a payment rail, it has no data to export")
    if store.get(ConnectionRow, f"{user_id}:{connector}") is None:
        raise HTTPException(409, f"{_label(connector)} isn't connected")
    if connector in ("google_pay", "google_sheets", "plaid"):
        data = {"transactions": [t.model_dump(mode="json") for t in store.query(TransactionRow, user_id=user_id)]}
    else:
        data = _dataset(connector)
    # BOM so Excel reads the rupee sign and other non-ASCII text correctly
    return Response("﻿" + _to_csv(data), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{connector}.csv"'})


@router.delete("/{user_id}/{connector}", status_code=204, response_model=None)
def disconnect(connector: str, user_id: str = Depends(resolve_user_id)) -> None:
    """Unlinking removes everything that source brought in (the app returns to empty); demo personas only lose the link (and any sheet rows)."""
    if not _known(connector):
        raise HTTPException(404, "Unknown connector")
    if connector in RAILS:
        return  # payment rails hold no user data: nothing to remove, and the ledger must stay untouched
    if store.get(ConnectionRow, f"{user_id}:{connector}") is None:
        raise HTTPException(404, f"{_label(connector)} isn't connected")
    # Only connectors that own ledger rows remove data; dataset-only ones (bank, invoices, investments) just unlink.
    if connector == "plaid":
        from app.api.plaid_router import clear_plaid
        clear_plaid(user_id)
    elif connector == "google_sheets":
        _clear_sheet(user_id) if user_id in DEMO_USER_IDS else _clear_user(user_id)
    elif connector == "google_pay" and user_id not in DEMO_USER_IDS:
        _clear_user(user_id)
    store.delete_where(InsightsSnapshotRow, user_id=user_id)
    store.delete(ConnectionRow, f"{user_id}:{connector}")
