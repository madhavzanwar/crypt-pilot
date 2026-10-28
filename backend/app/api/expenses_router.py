"""Quick expenses: suggest the item and price from a photo (or a typed name), then save it and learn the price."""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.core import store
from app.core.auth import resolve_user_id
from app.ocr import parse_receipt, read_text
from app.expenses import vlm
from app.expenses.suggest import item_key, remember, suggest
from app.models import AccountRow, PriceMemoryRow, TransactionRow
from app.schemas import AccountType, TxnCategory

router = APIRouter()

_MAX_PHOTO = 6 * 1024 * 1024
_CATEGORIES = {c.value for c in TxnCategory}


class Suggestion(BaseModel):
    item: str | None
    category: str
    price: float | None
    low: float | None
    high: float | None
    source: str  # memory | estimate | receipt | none
    confidence: float
    alternatives: list[str]


async def _photo(file: UploadFile | None) -> bytes | None:
    if file is None:
        return None
    data = await file.read()
    if len(data) > _MAX_PHOTO:
        raise HTTPException(413, "Photo is too large; please use one under 6 MB")
    return data or None


@router.post("/expenses/{user_id}/suggest", response_model=Suggestion)
async def suggest_expense(
    user_id: str = Depends(resolve_user_id),
    photo: UploadFile | None = File(default=None),
    name: str | None = Form(default=None),
    city: str | None = Form(default=None),
) -> dict:
    image = await _photo(photo)
    if not image and not (name and name.strip()):
        raise HTTPException(422, "Send a photo or a name")
    return await run_in_threadpool(_suggest_sync, user_id, image, name, city)


def _suggest_sync(user_id: str, image: bytes | None, name: str | None, city: str | None) -> dict:
    # CPU-bound (OCR + CLIP): runs in a worker thread so it never blocks the event loop for other requests
    text = read_text(image) if image else ""
    bill = parse_receipt(text)
    if text and not bill["total"]:  # readable text but no total found: let the vision model look at it
        bill = vlm.read_bill(image)
    if bill["total"]:  # a printed bill: its total beats any guess
        return {"item": bill["merchant"], "category": "other", "price": bill["total"], "low": None, "high": None,
                "source": "receipt", "confidence": 1.0, "alternatives": []}
    try:
        out = suggest(user_id, image, name, city)
        if image and out["source"] == "none" and not (name and name.strip()) and (seen := vlm.name_item(image)):
            named = suggest(user_id, None, seen, city)  # the vision model named it: price it by name
            if named["source"] != "none":
                out = named
        return out
    except OSError as e:  # unreadable image
        raise HTTPException(422, "Could not read that photo") from e


def _account(user_id: str) -> AccountRow:
    accounts = store.query(AccountRow, user_id=user_id)
    cash = next((a for a in accounts if a.name.lower() == "cash"), None)
    if cash or accounts:
        return cash or accounts[0]
    cash = AccountRow(user_id=user_id, name="Cash", type=AccountType.checking.value, balance=0)
    store.put(cash)
    return cash


@router.post("/expenses/{user_id}")
async def add_expense(
    user_id: str = Depends(resolve_user_id),
    item: str = Form(...),
    amount: float = Form(...),
    category: str | None = Form(default=None),
    photo: UploadFile | None = File(default=None),
) -> dict:
    image = await _photo(photo)
    return _save(user_id, item, amount, category, image)


def _save(user_id: str, item: str, amount: float, category: str | None, image: bytes | None) -> dict:
    """Book one cash expense and remember its price (and photo) so the next one can be filled in."""
    name = item.strip()
    if not name or not 0 < amount < 10_000_000:
        raise HTTPException(422, "Enter an item and an amount above zero")
    key = item_key(name)
    if category not in _CATEGORIES:
        category = suggest(user_id, None, key, None)["category"]
    row = TransactionRow(
        user_id=user_id, account_id=_account(user_id).id, date=date.today(), amount=-abs(amount),
        merchant=name.title(), category=category, description="Quick add", review_status="reviewed",
        reviewed_at=datetime.now(timezone.utc),
    )
    store.put(row)
    remember(user_id, key, abs(amount), category, image)
    return {"id": row.id, "item": key, "amount": abs(amount), "category": category}


# --- Photo -> price: teach an item once, then a photo alone books it -------------------------------------------


@router.post("/expenses/{user_id}/teach")
async def teach(
    user_id: str = Depends(resolve_user_id),
    item: str = Form(...),
    price: float = Form(...),
    category: str | None = Form(default=None),
    photo: UploadFile = File(...),
) -> dict:
    """Link a photo to a price (e.g. tea = 15). Saves nothing to the ledger; it only teaches."""
    name = item.strip()
    image = await _photo(photo)
    if not name or not image or not 0 < price < 10_000_000:
        raise HTTPException(422, "Send a photo, a name and a price above zero")
    key = item_key(name)
    if category not in _CATEGORIES:
        category = suggest(user_id, None, key, None)["category"]
    await run_in_threadpool(remember, user_id, key, price, category, image)
    return {"item": key, "price": price, "category": category}


@router.post("/expenses/{user_id}/snap")
async def snap(user_id: str = Depends(resolve_user_id), photo: UploadFile = File(...)) -> dict:
    """Photo only. If it is something you taught, book it at your price now; otherwise return a suggestion to confirm."""
    image = await _photo(photo)
    if not image:
        raise HTTPException(422, "Send a photo")
    try:
        out = await run_in_threadpool(_snap_suggest, user_id, image)
    except OSError as e:
        raise HTTPException(422, "Could not read that photo") from e
    if out["source"] == "memory" and out["price"]:
        return {"added": True, **_save(user_id, out["item"], out["price"], out["category"], image)}
    return {"added": False, "suggestion": out}


def _snap_suggest(user_id: str, image: bytes) -> dict:
    out = suggest(user_id, image, None, None)
    if out["source"] != "memory":  # this exact photo is new: ask the vision model which taught item it is
        taught = sorted({r.item for r in store.query(PriceMemoryRow, user_id=user_id)})
        if (seen := vlm.match_item(image, taught)):
            out = suggest(user_id, None, seen, None)
    return out


@router.get("/expenses/{user_id}/items")
def taught_items(user_id: str = Depends(resolve_user_id)) -> list[dict]:
    """Items with a remembered price, newest first."""
    latest: dict[str, dict] = {}
    for r in sorted(store.query(PriceMemoryRow, user_id=user_id), key=lambda r: r.created_at):
        latest[r.item] = {"item": r.item, "price": r.price, "category": r.category, "has_photo": bool(r.embedding)}
    return list(reversed(list(latest.values())))


@router.delete("/expenses/{user_id}/items/{item}")
def forget_item(item: str, user_id: str = Depends(resolve_user_id)) -> dict:
    store.delete_where(PriceMemoryRow, user_id=user_id, item=item_key(item))
    return {"forgotten": item_key(item)}
