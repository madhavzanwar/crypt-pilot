"""Upload a bank statement or passbook photo -> OCR -> strip personal data -> save only the cleaned transactions.

Two steps so the user sees exactly what will be stored: /extract returns a redacted preview (nothing is saved, the file is
never stored); /import saves the rows the user confirms. Raw OCR text never leaves this module.
"""
from __future__ import annotations

import hashlib
from datetime import date

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core import store
from app.core.auth import resolve_user_id
from app.core.ratelimit import upload_limiter
from app.ingest.categorize import categorize
from app.aa.mapper import _merchant
from app.models import AccountRow, TransactionRow
from app.ocr import read_text
from app.statement_ocr import parse_receipt_txn, parse_transactions, redact

router = APIRouter()

_IMAGES = (".png", ".jpg", ".jpeg", ".webp")
_EXTS = (".txt", ".csv") + _IMAGES
_MAX_BYTES = 5 * 1024 * 1024


class ExtractedTxn(BaseModel):
    date: date
    description: str = Field(max_length=160)
    amount: float = Field(gt=-10_000_000, lt=10_000_000)  # negative = money out


class ImportBody(BaseModel):
    transactions: list[ExtractedTxn] = Field(max_length=2000)


@router.post("/api/ocr/extract/{user_id}")
async def extract(file: UploadFile, user_id: str = Depends(resolve_user_id)) -> dict:
    upload_limiter.check(user_id)
    name = (file.filename or "").lower()
    if not name.endswith(_EXTS):
        raise HTTPException(400, f"Upload a photo or scan ({', '.join(_IMAGES)}) or a .txt/.csv statement")
    raw = await file.read(_MAX_BYTES + 1)
    if len(raw) > _MAX_BYTES:
        raise HTTPException(400, "File too large (max 5MB)")
    text = await run_in_threadpool(read_text, raw) if name.endswith(_IMAGES) else raw.decode("utf-8", errors="replace")
    if not text.strip():
        raise HTTPException(400, "Could not read any text. Try a sharper, well-lit photo.")
    clean, removed = redact(text)
    txns = parse_transactions(clean) or parse_receipt_txn(clean)  # a single ticket or bill has no statement rows
    if not txns:
        raise HTTPException(422, "No transactions found. The photo should show dates and amounts, or a bill with a total.")
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
        key = f"{t.date}|{t.description}|{t.amount}"
        rows.append(TransactionRow(
            id=f"{user_id}-ocr-{hashlib.sha1(key.encode()).hexdigest()[:16]}", user_id=user_id, account_id=acc_id, date=t.date,
            amount=t.amount, merchant=_merchant(t.description), category=categorize(_merchant(t.description), t.amount).value,
            description=t.description))
    unique = list({r.id: r for r in rows}.values())
    store.put(*unique)
    return {"imported": len(unique), "skipped_repeats": len(rows) - len(unique)}
