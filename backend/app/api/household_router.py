"""Household & Co-Piloting collaboration router (Pillar 5D).

Allows inviting partners, managing roles (owner, editor, viewer), hashing
invite tokens securely, aggregating real-time household net worth across
members, and providing multi-player financial visibility.
"""
from __future__ import annotations

import hashlib
import secrets
from collections import defaultdict
from datetime import date, date as date_cls, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.auth import resolve_user_id
from app.api.pay_router import user_lock
from app.core import store
from app.ingest.personas import FAMILY_MEMBERS
from app.api.transactions_router import _row_to_transaction
from app.models import AccountRow, HouseholdInviteRow, HouseholdMemberRow, HouseholdRow, TransactionRow
from app.schemas import (
    AddManagedMemberRequest,
    CategorySpend,
    HouseholdInsights,
    MemberCashflow,
    MonthlyMemberSpend,
    AddManagedTransactionRequest,
    MemberLedger,
    AcceptInviteRequest,
    CreateHouseholdRequest,
    CreateInviteRequest,
    Household,
    HouseholdInvite,
    HouseholdMember,
    HouseholdNetWorthSummary,
    HouseholdRole,
    HouseholdSummary,
    InviteStatus,
    MemberWealthContribution,
)

router = APIRouter()

_PERSONA_NAMES = {
    "demo-priya": "Priya",
    "demo-arjun": "Arjun",
    "demo-meera": "Meera",
    "demo-rishi": "Rishi",
    "demo-swara": "Swara",
    "demo-vedant": "Vedant",
}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _is_expired(expires_at: datetime | None) -> bool:
    if expires_at is None:
        return False
    if expires_at.tzinfo is not None:
        return expires_at < datetime.now(timezone.utc)
    return expires_at < datetime.now(timezone.utc).replace(tzinfo=None)


def _get_user_membership(user_id: str) -> tuple[HouseholdRow, HouseholdMemberRow] | None:
    member_row = store.first(HouseholdMemberRow, user_id=user_id)
    if not member_row:
        return None
    household_row = store.get(HouseholdRow, member_row.household_id)
    if not household_row:
        return None
    return household_row, member_row


def _compute_user_wealth(user_id: str) -> tuple[float, float, float]:
    accounts = store.query(AccountRow, user_id=user_id)
    assets = sum(max(0.0, acc.balance) for acc in accounts)
    liabilities = sum(abs(acc.balance) for acc in accounts if acc.balance < 0)
    net_worth = assets - liabilities
    return assets, liabilities, net_worth


def _build_household_summary(
    household: HouseholdRow, current_user_id: str
) -> HouseholdSummary:
    member_rows = store.query(HouseholdMemberRow, household_id=household.id)
    invite_rows = store.query(HouseholdInviteRow, household_id=household.id)

    # Check invite expiry
    expired = [inv for inv in invite_rows if inv.status == "pending" and _is_expired(inv.expires_at)]
    for inv in expired:
        inv.status = "expired"
    if expired:
        store.put(*expired)


    user_role = HouseholdRole.viewer
    members_breakdown: list[MemberWealthContribution] = []
    members_list: list[HouseholdMember] = []

    total_assets = 0.0
    total_liabilities = 0.0

    for m in member_rows:
        if m.user_id == current_user_id:
            user_role = HouseholdRole(m.role)

        assets, liabilities, nw = _compute_user_wealth(m.user_id)
        total_assets += assets
        total_liabilities += liabilities

        if m.is_managed:
            display_name = m.display_name or "Member"
        else:
            display_name = _PERSONA_NAMES.get(m.user_id, m.user_id.replace("demo-", "").capitalize())
        avatar_letter = display_name[:1].upper()

        members_list.append(
            HouseholdMember(
                id=m.id,
                household_id=m.household_id,
                user_id=m.user_id,
                role=HouseholdRole(m.role),
                joined_at=m.joined_at,
                display_name=display_name,
                avatar_letter=avatar_letter,
                net_worth=nw,
                is_managed=m.is_managed,
                relationship=m.relationship,
            )
        )

        members_breakdown.append(
            MemberWealthContribution(
                user_id=m.user_id,
                display_name=display_name,
                role=m.role,
                assets=assets,
                liabilities=liabilities,
                net_worth=nw,
                pct_of_household=0.0,
            )
        )

    total_net_worth = total_assets - total_liabilities

    # Share of the household's wealth. Someone with a negative net worth (e.g. a car loan) contributes 0%, and the
    # others split the rest -- dividing by the household total instead made the shares add up to more than 100%.
    positive_total = sum(max(0.0, mb.net_worth) for mb in members_breakdown)
    for mb in members_breakdown:
        if positive_total > 0:
            mb.pct_of_household = round(max(0.0, mb.net_worth) / positive_total * 100, 1)
        else:
            mb.pct_of_household = round(100.0 / max(1, len(members_breakdown)), 1)

    invites_list = [
        HouseholdInvite(
            id=inv.id,
            household_id=inv.household_id,
            invited_email=inv.invited_email,
            role=HouseholdRole(inv.role),
            status=InviteStatus(inv.status),
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            invite_link=f"/household?invite_id={inv.id}",
        )
        for inv in invite_rows
    ]

    net_worth_summary = HouseholdNetWorthSummary(
        total_net_worth=total_net_worth,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        members_breakdown=members_breakdown,
    )

    return HouseholdSummary(
        household=Household(
            id=household.id,
            name=household.name,
            owner_user_id=household.owner_user_id,
            created_at=household.created_at,
        ),
        members=members_list,
        invites=invites_list,
        net_worth_summary=net_worth_summary,
        user_role=user_role,
    )


@router.get("/api/household/{user_id}", response_model=HouseholdSummary | None)
def get_household(user_id: str = Depends(resolve_user_id)) -> HouseholdSummary | None:
    """The household summary, or `null` (HTTP 200) for someone who is not in a household: that is the normal empty state of
    the page (create / join cards), not an error."""
    membership = _get_user_membership(user_id)
    if not membership:
        return None
    household, _ = membership
    return _build_household_summary(household, user_id)


@router.post("/api/household/{user_id}", response_model=HouseholdSummary)
def create_household(
    req: CreateHouseholdRequest, user_id: str = Depends(resolve_user_id)
) -> HouseholdSummary:
    existing = _get_user_membership(user_id)
    if existing:
        raise HTTPException(400, "User is already a member of a household")

    household = HouseholdRow(
        name=req.name.strip() or f"{user_id[:1].upper()}{user_id[1:]}'s Household",
        owner_user_id=user_id,
    )
    member = HouseholdMemberRow(
        household_id=household.id,
        user_id=user_id,
        role="owner",
    )
    store.put(household, member)

    return _build_household_summary(household, user_id)


@router.post("/api/household/{user_id}/invites", response_model=HouseholdInvite)
def create_invite(
    req: CreateInviteRequest, user_id: str = Depends(resolve_user_id)
) -> HouseholdInvite:
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, member = membership
    if member.role not in ["owner", "editor"]:
        raise HTTPException(403, "Viewer role cannot invite new members")
    if req.role == HouseholdRole.owner and member.role != "owner":
        raise HTTPException(403, "Only an owner can invite someone as owner")

    raw_token = secrets.token_urlsafe(24)
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)

    invite = HouseholdInviteRow(
        household_id=household.id,
        invited_email=req.email.strip().lower(),
        role=req.role.value,
        token_hash=token_hash,
        status="pending",
        invited_by_user_id=user_id,
        created_at=now,
        expires_at=expires_at,
    )
    store.put(invite)

    return HouseholdInvite(
        id=invite.id,
        household_id=invite.household_id,
        invited_email=invite.invited_email,
        role=HouseholdRole(invite.role),
        status=InviteStatus(invite.status),
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        token=raw_token,
        invite_link=f"/household?invite={raw_token}",
    )


@router.post("/api/household/{user_id}/invites/accept", response_model=HouseholdSummary)
def accept_invite(
    req: AcceptInviteRequest, user_id: str = Depends(resolve_user_id)
) -> HouseholdSummary:
    existing = _get_user_membership(user_id)
    if existing:
        raise HTTPException(400, "User is already a member of a household")

    token_hash = _hash_token(req.token.strip())
    invite = store.first(HouseholdInviteRow, token_hash=token_hash)

    if not invite:
        raise HTTPException(404, "Invalid or expired invitation token")

    if invite.status != "pending" or _is_expired(invite.expires_at):
        if _is_expired(invite.expires_at) and invite.status == "pending":
            invite.status = "expired"
            store.put(invite)
        raise HTTPException(400, f"Invitation is no longer active (status: {invite.status})")

    household = store.get(HouseholdRow, invite.household_id)
    if not household:
        raise HTTPException(404, "Household no longer exists")

    # Join member
    now = datetime.now(timezone.utc)
    member = HouseholdMemberRow(
        household_id=household.id,
        user_id=user_id,
        role=invite.role,
        joined_at=now,
    )
    invite.status = "accepted"
    # shortcut: read-check-write is not transactional; concurrent accepts can race, upgrade to member id=user_id + create()
    store.put(member, invite)

    return _build_household_summary(household, user_id)


@router.delete("/api/household/{user_id}/invites/{invite_id}")
def revoke_invite(
    invite_id: str, user_id: str = Depends(resolve_user_id)
) -> dict:
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, member = membership
    if member.role not in ["owner", "editor"]:
        raise HTTPException(403, "Viewer role cannot revoke invites")

    invite = store.get(HouseholdInviteRow, invite_id)
    if not invite or invite.household_id != household.id:
        raise HTTPException(404, "Invite not found")

    invite.status = "revoked"
    store.put(invite)
    return {"revoked": True, "id": invite_id}


@router.delete("/api/household/{user_id}/members/{member_user_id}")
def remove_member(
    member_user_id: str, user_id: str = Depends(resolve_user_id)
) -> dict:
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, member = membership

    # Allow user to leave themselves, or owner to remove other members
    if user_id != member_user_id and member.role != "owner":
        raise HTTPException(403, "Only the household owner can remove other members")

    if member_user_id == household.owner_user_id and user_id != member_user_id:
        raise HTTPException(403, "The household's original owner cannot be removed by another member")

    if member_user_id == household.owner_user_id and user_id == member_user_id:
        # Check if other members exist
        other_members = [
            m for m in store.query(HouseholdMemberRow, household_id=household.id)
            if m.user_id != user_id
        ]
        if other_members:
            raise HTTPException(400, "Owner cannot leave while other members exist; transfer ownership first or delete household")

    target_member = store.first(
        HouseholdMemberRow, household_id=household.id, user_id=member_user_id
    )

    if not target_member:
        raise HTTPException(404, "Member not found in household")

    if target_member.role == "owner":
        owners = [m for m in store.query(HouseholdMemberRow, household_id=household.id) if m.role == "owner"]
        if len(owners) <= 1:
            raise HTTPException(400, "Cannot remove the last owner of a household")

    if target_member.is_managed:
        store.delete_where(TransactionRow, user_id=member_user_id)
        store.delete_where(AccountRow, user_id=member_user_id)
    store.delete(HouseholdMemberRow, target_member.id)
    return {"removed": True, "user_id": member_user_id}


def _managed_member(household_id: str, member_user_id: str) -> HouseholdMemberRow:
    m = store.first(HouseholdMemberRow, household_id=household_id, user_id=member_user_id)
    if not m or not m.is_managed:
        raise HTTPException(404, "Managed member not found in household")
    return m


def _member_to_schema(m: HouseholdMemberRow) -> HouseholdMember:
    _, _, nw = _compute_user_wealth(m.user_id)
    name = m.display_name if m.is_managed else _PERSONA_NAMES.get(m.user_id, m.user_id.replace("demo-", "").capitalize())
    name = name or "Member"
    return HouseholdMember(
        id=m.id, household_id=m.household_id, user_id=m.user_id, role=HouseholdRole(m.role),
        joined_at=m.joined_at, display_name=name, avatar_letter=name[:1].upper(), net_worth=nw,
        is_managed=m.is_managed, relationship=m.relationship,
    )


@router.post("/api/household/{user_id}/managed-members", response_model=HouseholdSummary)
def add_managed_member(
    req: AddManagedMemberRequest, user_id: str = Depends(resolve_user_id)
) -> HouseholdSummary:
    """Add a person with no login (e.g. a child) whose finances the household manages."""
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, member = membership
    if member.role not in ("owner", "editor"):
        raise HTTPException(403, "Viewer role cannot add members")
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")

    managed = HouseholdMemberRow(
        household_id=household.id,
        user_id=f"managed-{secrets.token_hex(8)}",
        role="viewer",
        is_managed=True,
        display_name=name[:60],
        relationship=(req.relationship or "").strip()[:30] or None,
    )
    wallet = AccountRow(user_id=managed.user_id, name=f"{name[:40]}'s Wallet", type="savings", balance=req.opening_balance)
    store.put(managed, wallet)
    return _build_household_summary(household, user_id)


@router.get("/api/household/{user_id}/members/{member_user_id}/ledger", response_model=MemberLedger)
def member_ledger(member_user_id: str, user_id: str = Depends(resolve_user_id)) -> MemberLedger:
    """Transactions & balance of any household member; owners/editors only."""
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, me = membership
    target = store.first(HouseholdMemberRow, household_id=household.id, user_id=member_user_id)
    if not target:
        raise HTTPException(404, "Member not found in household")
    if member_user_id != user_id and me.role not in ("owner", "editor"):
        raise HTTPException(403, "Viewer role cannot view other members' transactions")
    txns = sorted(store.query(TransactionRow, user_id=member_user_id), key=lambda t: (t.date, t.created_at), reverse=True)
    out = [_row_to_transaction(t) for t in txns[:200]]
    _, _, bal = _compute_user_wealth(member_user_id)
    return MemberLedger(
        member=_member_to_schema(target),
        balance=bal,
        total_in=sum(t.amount for t in txns if t.amount > 0),
        total_out=sum(-t.amount for t in txns if t.amount < 0),
        transactions=out,
    )


@router.post("/api/household/{user_id}/members/{member_user_id}/transactions", response_model=MemberLedger)
def add_managed_transaction(
    member_user_id: str, req: AddManagedTransactionRequest, user_id: str = Depends(resolve_user_id)
) -> MemberLedger:
    """Record a transaction for a managed member. Real members' data is never writable from here."""
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, me = membership
    if me.role not in ("owner", "editor"):
        raise HTTPException(403, "Viewer role cannot record transactions")
    managed = _managed_member(household.id, member_user_id)
    if not req.merchant.strip() or req.amount == 0:
        raise HTTPException(400, "Description and a non-zero amount are required")
    with user_lock(managed.user_id):  # read-modify-write of the wallet balance must not interleave
        account = store.first(AccountRow, user_id=managed.user_id)
        if not account:
            account = AccountRow(user_id=managed.user_id, name=f"{managed.display_name}'s Wallet", type="savings", balance=0.0)
        account.balance = round(account.balance + req.amount, 2)
        txn = TransactionRow(
            user_id=managed.user_id,
            account_id=account.id,
            date=req.date or date_cls.today(),
            amount=req.amount,
            merchant=req.merchant.strip()[:80],
            category=req.category.value,
            description=req.description,
            review_status="reviewed",
        )
        store.put(account, txn)
    return member_ledger(member_user_id, user_id)


_NON_SPEND = {"income", "transfer", "credit_card_payment", "investment_sip"}


@router.get("/api/household/{user_id}/insights", response_model=HouseholdInsights | None)
def household_insights(user_id: str = Depends(resolve_user_id)) -> HouseholdInsights | None:
    """Household-wide spending aggregates for charts: monthly trend, categories, per-member cashflow. `null` (200) when not in a household."""
    membership = _get_user_membership(user_id)
    if not membership:
        return None
    household, me = membership
    members = store.query(HouseholdMemberRow, household_id=household.id)
    if me.role not in ("owner", "editor"):
        members = [m for m in members if m.user_id == user_id]  # viewers only see their own numbers

    per_member = {m.user_id: store.query(TransactionRow, user_id=m.user_id) for m in members}
    all_dates = [t.date for txns in per_member.values() for t in txns]
    anchor = min(max(all_dates), date_cls.today()) if all_dates else date_cls.today()

    # last 6 calendar months ending at the anchor month
    keys: list[str] = []
    y, mo = anchor.year, anchor.month
    for _ in range(6):
        keys.append(f"{y:04d}-{mo:02d}")
        mo -= 1
        if mo == 0:
            y, mo = y - 1, 12
    keys.reverse()
    month_data = {k: {m.user_id: 0.0 for m in members} for k in keys}

    cutoff = anchor - timedelta(days=90)
    cats: dict[str, dict[str, float]] = {}
    inc = {m.user_id: 0.0 for m in members}
    spend = {m.user_id: 0.0 for m in members}
    for uid, txns in per_member.items():
        for t in txns:
            if t.date > anchor:
                continue
            key = f"{t.date.year:04d}-{t.date.month:02d}"
            is_spend = t.amount < 0 and t.category not in _NON_SPEND
            if is_spend and key in month_data:
                month_data[key][uid] += -t.amount
            if t.date >= cutoff:
                if is_spend:
                    cats.setdefault(t.category, {}).setdefault(uid, 0.0)
                    cats[t.category][uid] += -t.amount
                    spend[uid] += -t.amount
                elif t.category == "income" and t.amount > 0:
                    inc[uid] += t.amount

    names = {m.user_id: (m.display_name or "Member") if m.is_managed else _PERSONA_NAMES.get(m.user_id, m.user_id.replace("demo-", "").capitalize()) for m in members}
    categories = sorted(
        (CategorySpend(category=c, total=round(sum(v.values()), 2), by_member={k: round(x, 2) for k, x in v.items()}) for c, v in cats.items()),
        key=lambda c: -c.total,
    )
    return HouseholdInsights(
        months=[MonthlyMemberSpend(month=k, by_member={u: round(v, 2) for u, v in d.items()}, total=round(sum(d.values()), 2)) for k, d in month_data.items()],
        categories=categories,
        cashflow=[
            MemberCashflow(
                user_id=u, display_name=names[u], income=round(inc[u], 2), spend=round(spend[u], 2),
                savings_rate=round(max(0.0, (inc[u] - spend[u]) / inc[u] * 100), 1) if inc[u] > 0 else 0.0,
            )
            for u in names
        ],
        window_label="Last 90 days",
    )


@router.get("/api/household/{user_id}/networth", response_model=HouseholdNetWorthSummary)
def get_household_networth(user_id: str = Depends(resolve_user_id)) -> HouseholdNetWorthSummary:
    membership = _get_user_membership(user_id)
    if not membership:
        raise HTTPException(404, "User does not belong to any household")
    household, _ = membership
    summary = _build_household_summary(household, user_id)
    return summary.net_worth_summary


# --- Who spends what ---------------------------------------------------------------------------------------------

# Not new spending: card-bill payments and transfers repeat what was already counted; SIPs are saving.
_NOT_SPEND = {"transfer", "credit_card_payment", "income", "investment_sip"}


class SpendTxn(BaseModel):
    id: str
    date: date
    merchant: str
    category: str
    amount: float  # positive rupees spent


class SpendCategory(BaseModel):
    category: str
    amount: float


class MerchantSpend(BaseModel):
    merchant: str
    amount: float


class MonthSpend(BaseModel):
    month: str  # YYYY-MM
    amount: float


class MemberSpending(BaseModel):
    user_id: str
    display_name: str
    avatar_letter: str
    relation: str | None = None
    role: str
    total_spend: float
    previous_spend: float
    change_pct: float | None  # vs the previous period of the same length; None when there was nothing before
    share_pct: float  # of the household's total spend in the period
    txn_count: int
    monthly_income: float
    by_category: list[SpendCategory]
    top_merchants: list[MerchantSpend]
    recent: list[SpendTxn]
    monthly_trend: list[MonthSpend]


class HouseholdSpending(BaseModel):
    household_id: str
    household_name: str
    days: int
    viewer_user_id: str
    viewer_role: str
    can_view_all: bool
    total_spend: float
    members: list[MemberSpending]


def _is_spend(t: TransactionRow) -> bool:
    # The planted demo-threat rows (tagged "fishy") belong to the Evidence Room; they are not everyday family spending.
    return t.amount < 0 and t.category not in _NOT_SPEND and "fishy" not in (t.tags or "")


def _member_spending(m: HouseholdMemberRow, days: int, today: date) -> MemberSpending:
    rows = store.query(TransactionRow, user_id=m.user_id)
    start, prev_start = today - timedelta(days=days), today - timedelta(days=2 * days)
    cur = [t for t in rows if _is_spend(t) and start < t.date <= today]
    prev_total = sum(-t.amount for t in rows if _is_spend(t) and prev_start < t.date <= start)
    total = sum(-t.amount for t in cur)

    by_cat: dict[str, float] = defaultdict(float)
    by_merchant: dict[str, float] = defaultdict(float)
    for t in cur:
        by_cat[t.category] += -t.amount
        by_merchant[t.merchant or "Unknown"] += -t.amount

    months: list[str] = []
    y, mo_ = today.year, today.month
    for _ in range(6):
        months.append(f"{y:04d}-{mo_:02d}")
        mo_ -= 1
        if mo_ == 0:
            y, mo_ = y - 1, 12
    months.reverse()
    by_month: dict[str, float] = defaultdict(float)
    for t in rows:
        if _is_spend(t):
            by_month[t.date.strftime("%Y-%m")] += -t.amount

    income = sum(t.amount for t in rows if t.amount > 0 and t.category == "income" and start < t.date <= today)
    if m.is_managed:
        name = m.display_name or "Member"
    else:
        name = _PERSONA_NAMES.get(m.user_id) or FAMILY_MEMBERS.get(m.user_id, (m.user_id,))[0].replace("demo-", "").capitalize()
    relation = m.relationship if m.is_managed else FAMILY_MEMBERS.get(m.user_id, (None, None))[1]
    return MemberSpending(
        user_id=m.user_id,
        display_name=name,
        avatar_letter=name[:1].upper(),
        relation=relation,
        role=m.role,
        total_spend=round(total, 2),
        previous_spend=round(prev_total, 2),
        change_pct=round((total - prev_total) / prev_total * 100, 1) if prev_total > 0 else None,
        share_pct=0.0,
        txn_count=len(cur),
        monthly_income=round(income * 30 / days, 2),
        by_category=[SpendCategory(category=c, amount=round(a, 2)) for c, a in sorted(by_cat.items(), key=lambda kv: -kv[1])],
        top_merchants=[MerchantSpend(merchant=k, amount=round(a, 2)) for k, a in sorted(by_merchant.items(), key=lambda kv: -kv[1])[:5]],
        recent=[SpendTxn(id=t.id, date=t.date, merchant=t.merchant or "Unknown", category=t.category, amount=round(-t.amount, 2))
                for t in sorted(cur, key=lambda t: (t.date, t.id), reverse=True)[:12]],
        monthly_trend=[MonthSpend(month=mo, amount=round(by_month.get(mo, 0.0), 2)) for mo in months],
    )


@router.get("/api/household/{user_id}/spending", response_model=HouseholdSpending | None)
def get_household_spending(days: int = Query(30, ge=7, le=365), user_id: str = Depends(resolve_user_id)) -> HouseholdSpending | None:
    """What each household member has spent. The owner and editors see everyone; a viewer sees only their own spending.
    `null` (200) when the user is not in a household."""
    membership = _get_user_membership(user_id)
    if not membership:
        return None
    household, me = membership
    can_view_all = me.role in ("owner", "editor")
    members = store.query(HouseholdMemberRow, household_id=household.id)
    if not can_view_all:
        members = [m for m in members if m.user_id == user_id]
    order = {"owner": 0, "editor": 1, "viewer": 2}
    members.sort(key=lambda m: (order.get(m.role, 3), m.joined_at))
    today = date.today()
    out = [_member_spending(m, days, today) for m in members]
    total = sum(x.total_spend for x in out)
    for x in out:
        x.share_pct = round(x.total_spend / total * 100, 1) if total > 0 else 0.0
    return HouseholdSpending(
        household_id=household.id, household_name=household.name, days=days, viewer_user_id=user_id,
        viewer_role=me.role, can_view_all=can_view_all, total_spend=round(total, 2), members=out,
    )
