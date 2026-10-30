"""Upload a bank statement or passbook photo -> OCR -> strip personal data -> save only the cleaned transactions.

Two steps so the user sees exactly what will be stored: /extract returns a redacted preview (nothing is saved, the file is
never stored); /import saves the rows the user confirms. Raw OCR text never leaves this module.
"""
from __future__ import annotations

import hashlib
from datetime import date

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, field_validator

from app.core import store
from app.core.auth import resolve_user_id
from app.core.validate import check_amount, check_date
from app.core.ratelimit import scoped_key, upload_limiter
from app.ingest.categorize import categorize
from app.aa.mapper import _merchant
from app.models import AccountRow, TransactionRow
from app.ocr import read_text
from app.ingest.upload import parse_transaction_csv
from app.statement_ocr import clean_description, parse_receipt_txn, parse_transactions, redact

router = APIRouter()

_IMAGES = (".png", ".jpg", ".jpeg", ".webp")
_EXTS = (".txt", ".csv") + _IMAGES
_MAX_BYTES = 5 * 1024 * 1024


class ExtractedTxn(BaseModel):
    date: date
    description: str = Field(max_length=160)
    amount: float = Field(gt=-10_000_000, lt=10_000_000, allow_inf_nan=False)  # negative = money out

    @field_validator("date")
    @classmethod
    def _sane_date(cls, v):
        return check_date(v)

    @field_validator("amount")
    @classmethod
    def _sane_amount(cls, v: float) -> float:
        return check_amount(v)


class ImportBody(BaseModel):
    transactions: list[ExtractedTxn] = Field(max_length=2000)


def _csv_rows(raw: bytes) -> tuple[list[dict], dict[str, int]]:
    """A .csv bank export goes through the CSV importer's parser (header-aware: Amount or Debit/Credit columns, any date style),
    then the same redaction as OCR text, so the review-then-import flow is identical. Returns ([], {}) if it is not a table."""
    try:
        parsed = parse_transaction_csv(raw)
    except ValueError as exc:
        if "must include" in str(exc):
            return [], {}  # no recognisable header: let the statement-text parser try it
        raise HTTPException(422, f"Could not read this CSV: {exc}") from exc
    except Exception:  # noqa: BLE001 - pandas raises many types for malformed files
        return [], {}
    removed: dict[str, int] = {}
    out = []
    for t in parsed:
        desc, r = redact(t.merchant)
        for k, n in r.items():
            removed[k] = removed.get(k, 0) + n
        desc = clean_description(desc)
        if desc and t.amount != 0:
            out.append({"date": t.date.isoformat(), "description": desc[:160], "amount": round(float(t.amount), 2)})
    return out, removed


@router.post("/api/ocr/extract/{user_id}")
async def extract(file: UploadFile, request: Request, user_id: str = Depends(resolve_user_id)) -> dict:
    rl_key = scoped_key(request, user_id)
    upload_limiter.check(rl_key, record=False)  # rejected or unreadable files do not use up the allowance
    name = (file.filename or "").lower()
    if not name.endswith(_EXTS):
        raise HTTPException(400, f"Upload a photo or scan ({', '.join(_IMAGES)}) or a .txt/.csv statement")
    raw = await file.read(_MAX_BYTES + 1)
    if len(raw) > _MAX_BYTES:
        raise HTTPException(400, "File too large (max 5MB)")
    if name.endswith(".csv"):
        if not raw.strip():
            raise HTTPException(400, "That CSV file is empty.")
        rows, removed = _csv_rows(raw)
        if rows:
            upload_limiter.record(rl_key)
            return {"transactions": rows, "removed": removed}
    text = await run_in_threadpool(read_text, raw) if name.endswith(_IMAGES) else raw.decode("utf-8", errors="replace")
    if not text.strip():
        raise HTTPException(400, "Could not read any text. Try a sharper, well-lit photo.")
    clean, removed = redact(text)
    txns = parse_transactions(clean) or parse_receipt_txn(clean)  # a single ticket or bill has no statement rows
    if not txns:
        if name.endswith((".csv", ".txt")):
            raise HTTPException(422, "No transactions found. The file needs a Date column, a Description column and either an Amount column or Debit and Credit columns.")
        raise HTTPException(422, "No transactions found. The photo should show dates and amounts, or a bill with a total.")
    upload_limiter.record(rl_key)
    return {"transactions": [{k: t[k] for k in ("date", "description", "amount")} for t in txns], "removed": removed}


@router.post("/api/ocr/import/{user_id}")
def import_rows(body: ImportBody, user_id: str = Depends(resolve_user_id)) -> dict:
    if not body.transactions:
        raise HTTPException(422, "Nothing to import")
    acc_id = f"{user_id}-ocr"
    if store.get(AccountRow, acc_id) is None:
        store.put(AccountRow(id=acc_id, user_id=user_id, name="Uploaded statements", type="checking", balance=0.0))
    rows = []
    for t in body.transactions:
        # stable id: re-uploading the same statement overwrites instead of duplicating
        desc = clean_description(t.description) or t.description  # older previews may still carry Dr/Cr markers
        key = f"{t.date}|{desc}|{t.amount}"
        rows.append(TransactionRow(
            id=f"{user_id}-ocr-{hashlib.sha1(key.encode()).hexdigest()[:16]}", user_id=user_id, account_id=acc_id, date=t.date,
            amount=t.amount, merchant=_merchant(desc), category=categorize(_merchant(desc), t.amount).value,
            description=desc))
    unique = list({r.id: r for r in rows}.values())
    store.put(*unique)
    return {"imported": len(unique), "skipped_repeats": len(rows) - len(unique)}
