"""Demo UPI pay app: books a scanned-QR payment into a user's ledger (no real money moves).

The phone demo app (/pay) posts here; the transaction is stored like any other, so the dashboard, budgets and
insights update from it. /live is a cheap change counter the open dashboard polls to refresh itself.
"""
from __future__ import annotations

import secrets
import threading
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.ingest.snapshot import _transactions_df
from app.models import BudgetRow, PairRow, PayLimitRow, PaymentReviewRow
from app.payment_check import assess

from app.core import store
from app.core.auth import resolve_user_id
from app.ingest.categorize import categorize
from app.models import AccountRow, TransactionRow
from app.schemas import AccountType

router = APIRouter()

_locks_guard = threading.Lock()
_user_locks: dict[str, threading.Lock] = {}


def user_lock(user_id: str) -> threading.Lock:
    """One lock per user so balance check + deduct is atomic within this process (the handlers are sync, run in threads)."""
    with _locks_guard:
        return _user_locks.setdefault(user_id, threading.Lock())


class PayBody(BaseModel):
    payee_name: str = Field(min_length=1, max_length=80)
    upi_id: str = Field(min_length=3, max_length=80, pattern=r"^[\w.\-]{2,}@[\w.\-]{2,}$")
    amount: float = Field(gt=0, le=100_000)  # UPI per-transaction limit
    note: str | None = Field(default=None, max_length=80)


def _inr(v: float) -> str:
    return f"₹{v:,.0f}"


def _account(user_id: str) -> AccountRow:
    accounts = store.query(AccountRow, user_id=user_id)
    bank = next((a for a in accounts if a.type == AccountType.checking.value and a.name.lower() != "cash"), None)
    if bank or accounts:
        return bank or accounts[0]
    acc = AccountRow(user_id=user_id, name="UPI account", type=AccountType.checking.value, balance=0)
    store.put(acc)
    return acc


PAIR_DAYS = 30


async def payer(user_id: str, authorization: str | None = Header(default=None), x_pair_code: str | None = Header(default=None)) -> str:
    """The website authenticates normally; the phone app has no login, so it sends the pairing code the signed-in website created."""
    if x_pair_code:
        pair = store.get(PairRow, x_pair_code)
        if pair is None or pair.user_id != user_id or datetime.now(timezone.utc) - pair.created_at > timedelta(days=PAIR_DAYS):
            raise HTTPException(403, "Pairing code is invalid or expired. Pair the phone again from the dashboard.")
        if pair.claimed_at is None:
            pair.claimed_at = datetime.now(timezone.utc)
            store.put(pair)
        return user_id
    return await resolve_user_id(user_id, authorization)


@router.post("/pay/{user_id}/pair")
def make_pair(user_id: str = Depends(resolve_user_id)) -> dict:
    """Signed-in website: mint a code so the phone app can book payments into THIS account."""
    pair = PairRow(id=secrets.token_urlsafe(8), user_id=user_id)
    store.put(pair)
    return {"code": pair.id, "expires_in_days": PAIR_DAYS}


@router.get("/pay/{user_id}/pair")
def pair_status(code: str | None = None, user_id: str = Depends(resolve_user_id)) -> dict:
    """Website: has the phone opened this code yet, and is any phone paired to this account?"""
    pairs = store.query(PairRow, user_id=user_id)
    return {"claimed": any(p.id == code and p.claimed_at for p in pairs), "connected": any(p.claimed_at for p in pairs)}


@router.get("/pay/{user_id}/history")
def history(limit: int = 15, user_id: str = Depends(payer)) -> list[dict]:
    """Newest payments made by UPI, for the phone app's history list (the same ledger the dashboard reads)."""
    rows = [t for t in store.query(TransactionRow, user_id=user_id) if (t.description or "").startswith("UPI to")]
    rows.sort(key=lambda r: (r.date, r.created_at), reverse=True)
    return [{"id": t.id, "merchant": t.merchant, "amount": -t.amount, "date": t.date.isoformat(), "category": t.category} for t in rows[: max(1, min(limit, 50))]]


@router.post("/pay/{user_id}")
def pay(body: PayBody, user_id: str = Depends(payer)) -> dict:
    with user_lock(user_id):
        return _pay_locked(body, user_id)


def _pay_locked(body: PayBody, user_id: str) -> dict:
    acc = _account(user_id)
    merchant = body.payee_name.strip()
    category = categorize(merchant, body.amount).value
    before = _transactions_df(store.query(TransactionRow, user_id=user_id))  # history excludes this payment
    budget = next((b.monthly_limit for b in store.query(BudgetRow, user_id=user_id) if b.category == category), None)
    row = TransactionRow(
        user_id=user_id, account_id=acc.id, date=date.today(), amount=-body.amount, merchant=merchant,
        category=category, description=f"UPI to {body.upi_id}" + (f": {body.note}" if body.note else ""),
        review_status="reviewed", reviewed_at=datetime.now(timezone.utc),
    )
    review = assess(
        txn_id=row.id, df=before, amount=body.amount, payee=merchant, upi_id=body.upi_id, category=category,
        balance_before=acc.balance, budget_limit=budget,
    )
    limit = store.get(PayLimitRow, user_id)
    refusal = None
    if body.amount > acc.balance:
        refusal = f"Insufficient balance. Available {_inr(acc.balance)}, payment {_inr(body.amount)}."
    elif limit is not None and body.amount > limit.per_payment:
        refusal = f"Over your payment limit of {_inr(limit.per_payment)}. Raise it on your FinPilot dashboard to pay this."
    if refusal:  # nothing is booked; the attempt is kept so the dashboard can show why it was stopped
        review = review.model_copy(update={"heavy": False, "verdict": "suspicious", "headline": refusal})
        store.put(PaymentReviewRow(id=row.id, user_id=user_id, payee_name=merchant, amount=body.amount, heavy=False,
                                   verdict="suspicious", status="blocked", payload=review.model_dump_json()))
        raise HTTPException(402, refusal)
    acc.balance = round(acc.balance - body.amount, 2)
    store.put(row, acc)  # a normal payment is simply completed: no automatic flag or warning
    return {
        "id": row.id, "status": "success", "amount": body.amount, "payee_name": merchant, "upi_id": body.upi_id,
        "category": row.category, "paid_at": datetime.now(timezone.utc).isoformat(), "balance": acc.balance, "account": acc.name,
    }


class LimitBody(BaseModel):
    per_payment: float | None = Field(default=None, gt=0, le=100_000)  # None removes the limit


@router.get("/pay/{user_id}/limit")
def get_limit(user_id: str = Depends(payer)) -> dict:
    row = store.get(PayLimitRow, user_id)
    return {"per_payment": row.per_payment if row else None}


@router.put("/pay/{user_id}/limit")
def set_limit(body: LimitBody, user_id: str = Depends(resolve_user_id)) -> dict:
    if body.per_payment is None:
        store.delete(PayLimitRow, user_id)
    else:
        store.put(PayLimitRow(id=user_id, user_id=user_id, per_payment=body.per_payment))
    return {"per_payment": body.per_payment}


@router.get("/pay/{user_id}/reviews")
def reviews(limit: int = 5, user_id: str = Depends(payer)) -> list[dict]:
    """Newest first: payments the app refused (insufficient balance or over your limit), with the reason and impact."""
    import json

    rows = sorted(store.query(PaymentReviewRow, user_id=user_id), key=lambda r: r.created_at, reverse=True)[: max(1, min(limit, 20))]
    return [
        {"id": r.id, "payee_name": r.payee_name, "amount": r.amount, "status": r.status, "created_at": r.created_at.isoformat(),
         "review": json.loads(r.payload)}
        for r in rows
    ]


class StatusBody(BaseModel):
    status: str = Field(pattern=r"^(confirmed|reported)$")


@router.post("/pay/{user_id}/reviews/{review_id}/status")
def set_status(review_id: str, body: StatusBody, user_id: str = Depends(resolve_user_id)) -> dict:
    r = store.get(PaymentReviewRow, review_id)
    if r is None or r.user_id != user_id:
        raise HTTPException(404, "No such payment review")
    r.status = body.status
    rows: list = [r]
    t = store.get(TransactionRow, review_id)
    if t is not None and body.status == "reported":
        t.notes, t.review_status = "Reported by you as not authorised", "pending"
        rows.append(t)
    store.put(*rows)
    return {"id": r.id, "status": r.status}


@router.get("/pay/{user_id}/live")
def live(user_id: str = Depends(payer)) -> dict:
    """Changes whenever this user's data is written, on any server instance (shared marker in Firestore)."""
    return {"version": store.live_version(user_id)}
