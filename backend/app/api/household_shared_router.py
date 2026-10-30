"""Shared household expenses ("Who owes who"): expenses, settlements, balances and suggested settle-up transfers.

Money is handled in integer paise (rupees rounded half up), so shares always add up exactly; the remainder paise of an
equal split are handed out deterministically. Members are identified by household member `user_id` (real users and
`managed-<hex>` family members without accounts). The demo household's expenses are generated on the fly (never stored)
and are read-only.
"""
from __future__ import annotations

import datetime as dt
import json
import zlib
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.household_router import _PERSONA_NAMES, _get_user_membership
from app.core import store
from app.core.auth import resolve_user_id
from app.core.validate import MAX_AMOUNT, check_date, today
from app.ingest.personas import FAMILY_MEMBERS
from app.models import HouseholdMemberRow, HouseholdRow, SettlementRow, SharedExpenseRow

router = APIRouter()

SAMPLE_HOUSEHOLD_ID = "hh-priya-family"
READ_ONLY_MSG = "This is shared sample data. Sign in or create your own household to track real expenses."
FORMER = "Former member"


# --- money helpers ---------------------------------------------------------------------------------------------------

def to_paise(amount: float) -> int:
    """Rupees to integer paise, rounding half up (decimal arithmetic, so 0.005 never becomes 0.00 through float noise)."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def split_paise(total: int, members: list[str], seed: str) -> dict[str, int]:
    """Equal split of `total` paise; the `total % n` leftover paise go one each to members chosen deterministically from `seed`."""
    ids = sorted(set(members))
    base, rem = divmod(total, len(ids))
    start = zlib.crc32(seed.encode()) % len(ids)
    shares = {m: base for m in ids}
    for k in range(rem):
        shares[ids[(start + k) % len(ids)]] += 1
    return shares


def compute_balances(
    member_ids: list[str], expenses: list[tuple[str, int, str, list[str]]], settlements: list[tuple[str, str, int]]
) -> dict[str, dict[str, int]]:
    """expenses: (expense_id, paise, paid_by, split_among); settlements: (from, to, paise). Returns paid/owed/net per member id.

    net > 0 means the member is owed money. A settlement moves money from `from` (the debtor paying) to `to`, so it raises the
    payer's net and lowers the receiver's."""
    book: dict[str, dict[str, int]] = {}

    def row(m: str) -> dict[str, int]:
        return book.setdefault(m, {"paid": 0, "owed": 0, "sent": 0, "received": 0})

    for m in member_ids:
        row(m)
    for eid, paise, payer, split in expenses:
        row(payer)["paid"] += paise
        for m, share in split_paise(paise, split, eid).items():
            row(m)["owed"] += share
    for frm, to, paise in settlements:
        row(frm)["sent"] += paise
        row(to)["received"] += paise
    for b in book.values():
        b["net"] = b["paid"] - b["owed"] + b["sent"] - b["received"]
    return book


def suggest_transfers(nets: dict[str, int]) -> list[tuple[str, str, int]]:
    """Greedy minimisation: repeatedly the biggest debtor pays the biggest creditor."""
    creditors = sorted(([m, n] for m, n in nets.items() if n > 0), key=lambda x: (-x[1], x[0]))
    debtors = sorted(([m, -n] for m, n in nets.items() if n < 0), key=lambda x: (-x[1], x[0]))
    out: list[tuple[str, str, int]] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i][1], creditors[j][1])
        if pay > 0:
            out.append((debtors[i][0], creditors[j][0], pay))
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1
    return out


# --- household plumbing ----------------------------------------------------------------------------------------------

def _is_demo(user_id: str) -> bool:
    return user_id.startswith("demo-")


def _member_name(m: HouseholdMemberRow) -> str:
    if m.is_managed:
        return m.display_name or "Member"
    return _PERSONA_NAMES.get(m.user_id) or FAMILY_MEMBERS.get(m.user_id, (m.user_id.replace("demo-", "").capitalize(),))[0]


def _sample(household_id: str, member_ids: list[str]) -> tuple[list[SharedExpenseRow], list[SettlementRow]]:
    """Deterministic demo data relative to today. Never stored."""
    if not {"demo-priya", "demo-rishi", "demo-swara", "demo-vedant"} <= set(member_ids):
        return [], []
    t = today()
    everyone = ["demo-priya", "demo-rishi", "demo-swara", "demo-vedant"]
    spec = [
        ("Groceries - D-Mart", 3247.50, "demo-priya", everyone, "groceries", 2),
        ("Electricity bill", 2150.00, "demo-rishi", everyone, "utilities", 5),
        ("Family dinner - Truffles", 2890.00, "demo-rishi", everyone, "dining", 8),
        ("Movie tickets", 900.00, "demo-priya", ["demo-priya", "demo-swara", "demo-vedant"], "entertainment", 11),
        ("School project supplies", 640.25, "demo-priya", ["demo-swara", "demo-vedant"], "education", 14),
        ("Weekend cab to Nandi Hills", 1850.00, "demo-rishi", ["demo-priya", "demo-rishi", "demo-swara"], "transport", 18),
    ]
    expenses = [
        SharedExpenseRow(
            id=f"sample-exp-{i}", household_id=household_id, title=title, amount_paise=to_paise(amt), paid_by=payer,
            split_among_json=json.dumps(split), category=cat, date=t - timedelta(days=ago), created_by=payer,
            created_at=datetime.combine(t - timedelta(days=ago), time(9, 0), tzinfo=timezone.utc),
        )
        for i, (title, amt, payer, split, cat, ago) in enumerate(spec, 1)
    ]
    settlements = [
        SettlementRow(
            id="sample-set-1", household_id=household_id, from_member="demo-vedant", to_member="demo-priya", amount_paise=to_paise(500),
            date=t - timedelta(days=4), note="Cash", created_by="demo-vedant",
            created_at=datetime.combine(t - timedelta(days=4), time(9, 0), tzinfo=timezone.utc),
        )
    ]
    return expenses, settlements


def _split_of(e: SharedExpenseRow) -> list[str]:
    try:
        v = json.loads(e.split_among_json)
        return [str(x) for x in v] if isinstance(v, list) else []
    except ValueError:
        return []


def _summary(household: HouseholdRow, user_id: str) -> dict:
    members = store.query(HouseholdMemberRow, household_id=household.id)
    members.sort(key=lambda m: (m.joined_at, m.user_id))
    current = [m.user_id for m in members]
    is_sample = household.id == SAMPLE_HOUSEHOLD_ID
    if is_sample:
        expenses, settlements = _sample(household.id, current)
    else:
        expenses = store.query(SharedExpenseRow, household_id=household.id)
        settlements = store.query(SettlementRow, household_id=household.id)
    expenses.sort(key=lambda e: (e.date, e.created_at, e.id), reverse=True)
    settlements.sort(key=lambda s: (s.date, s.created_at, s.id), reverse=True)

    book = compute_balances(
        current,
        [(e.id, e.amount_paise, e.paid_by, _split_of(e) or [e.paid_by]) for e in expenses],
        [(s.from_member, s.to_member, s.amount_paise) for s in settlements],
    )
    names = {m.user_id: _member_name(m) for m in members}
    nets = {m: book[m]["net"] for m in current}  # removed members never appear in balances or transfers
    former = sorted(m for m in book if m not in names)

    def rupees(p: int) -> float:
        return round(p / 100, 2)

    return {
        "household_id": household.id,
        "sample": is_sample,
        "read_only": is_sample or _is_demo(user_id),
        "members": [{"id": m.user_id, "name": names[m.user_id], "kind": "managed" if m.is_managed else "user"} for m in members],
        "former_members": [{"id": m, "name": FORMER} for m in former],
        "expenses": [
            {"id": e.id, "title": e.title, "amount": rupees(e.amount_paise), "paid_by": e.paid_by, "split_among": _split_of(e) or [e.paid_by],
             "category": e.category, "date": e.date.isoformat(), "created_by": e.created_by, "created_at": e.created_at.isoformat()}
            for e in expenses
        ],
        "settlements": [
            {"id": s.id, "from": s.from_member, "to": s.to_member, "amount": rupees(s.amount_paise), "date": s.date.isoformat(), "note": s.note}
            for s in settlements
        ],
        "balances": [
            {"member_id": m, "name": names[m], "paid": rupees(book[m]["paid"]), "owed": rupees(book[m]["owed"]), "net": rupees(book[m]["net"])}
            for m in current
        ],
        "transfers": [{"from": a, "to": b, "amount": rupees(p)} for a, b, p in suggest_transfers(nets)],
    }


def _writer(user_id: str) -> tuple[HouseholdRow, HouseholdMemberRow]:
    """The caller's household and membership, or the right error for someone who may not write."""
    if _is_demo(user_id):
        raise HTTPException(403, READ_ONLY_MSG)
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, me = membership
    if household.id == SAMPLE_HOUSEHOLD_ID:
        raise HTTPException(403, READ_ONLY_MSG)
    if me.role not in ("owner", "editor"):
        raise HTTPException(403, "Viewer role cannot add or change shared expenses")
    return household, me


def _member_ids(household: HouseholdRow) -> list[str]:
    return [m.user_id for m in store.query(HouseholdMemberRow, household_id=household.id)]


# --- request models --------------------------------------------------------------------------------------------------

class SharedExpenseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)
    paid_by: str = Field(min_length=1, max_length=80)
    split_among: list[str] | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=40)
    date: dt.date | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 120:
            raise ValueError("title must be 1 to 120 characters")
        return v

    @field_validator("category")
    @classmethod
    def _category(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("date")
    @classmethod
    def _date(cls, v: dt.date | None) -> dt.date | None:
        return check_date(v)


class SettlementBody(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_member: str = Field(alias="from", min_length=1, max_length=80)
    to_member: str = Field(alias="to", min_length=1, max_length=80)
    amount: float = Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)
    note: str | None = Field(default=None, max_length=200)
    date: dt.date | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("date")
    @classmethod
    def _date(cls, v: dt.date | None) -> dt.date | None:
        return check_date(v)


# --- endpoints -------------------------------------------------------------------------------------------------------

@router.get("/api/household/{user_id}/shared-expenses")
def get_shared_expenses(user_id: str = Depends(resolve_user_id)) -> dict | None:
    membership = _get_user_membership(user_id)
    if not membership:
        return None
    return _summary(membership[0], user_id)


@router.post("/api/household/{user_id}/shared-expenses", status_code=201)
def add_shared_expense(body: SharedExpenseBody, user_id: str = Depends(resolve_user_id)) -> dict:
    household, _ = _writer(user_id)
    members = _member_ids(household)
    paise = to_paise(body.amount)
    if paise < 1:
        raise HTTPException(422, "amount is too small: the minimum is Rs 0.01")
    if body.paid_by not in members:
        raise HTTPException(422, "paid_by is not a member of this household")
    split = list(dict.fromkeys(body.split_among)) if body.split_among is not None else list(members)
    if not split:
        raise HTTPException(422, "split_among needs at least one member")
    if any(m not in members for m in split):
        raise HTTPException(422, "split_among contains someone who is not a member of this household")
    store.put(SharedExpenseRow(
        household_id=household.id, title=body.title, amount_paise=paise, paid_by=body.paid_by, split_among_json=json.dumps(split),
        category=body.category, date=body.date or today(), created_by=user_id,
    ))
    return _summary(household, user_id)


@router.delete("/api/household/{user_id}/shared-expenses/{expense_id}")
def delete_shared_expense(expense_id: str, user_id: str = Depends(resolve_user_id)) -> dict:
    if _is_demo(user_id):
        raise HTTPException(403, READ_ONLY_MSG)
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, me = membership
    if household.id == SAMPLE_HOUSEHOLD_ID:
        raise HTTPException(403, READ_ONLY_MSG)
    expense = store.get(SharedExpenseRow, expense_id)
    if not expense or expense.household_id != household.id:
        raise HTTPException(404, "Shared expense not found")
    if me.role not in ("owner", "editor") and expense.created_by != user_id:
        raise HTTPException(403, "Only owners, editors or the person who added it can delete this expense")
    store.delete(SharedExpenseRow, expense_id)
    return _summary(household, user_id)


@router.post("/api/household/{user_id}/settlements", status_code=201)
def add_settlement(body: SettlementBody, user_id: str = Depends(resolve_user_id)) -> dict:
    household, _ = _writer(user_id)
    members = _member_ids(household)
    paise = to_paise(body.amount)
    if paise < 1:
        raise HTTPException(422, "amount is too small: the minimum is Rs 0.01")
    if body.from_member == body.to_member:
        raise HTTPException(422, "from and to must be different members")
    if body.from_member not in members or body.to_member not in members:
        raise HTTPException(422, "from and to must both be members of this household")
    store.put(SettlementRow(
        household_id=household.id, from_member=body.from_member, to_member=body.to_member, amount_paise=paise,
        date=body.date or today(), note=body.note, created_by=user_id,
    ))
    return _summary(household, user_id)
