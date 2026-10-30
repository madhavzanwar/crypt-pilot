"""Row schemas for the Firestore collections (via app.core.store).

Collection name = __tablename__, document id = id. Every user-owned row carries
`user_id` (the Firebase Auth uid). SQLModel is kept only for validation and
JSON (de)serialisation of rows.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid.uuid4())


class AccountRow(SQLModel, table=True):
    __tablename__ = "accounts"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    name: str
    type: str
    balance: float
    credit_limit: float | None = None
    interest_rate_apr: float | None = None
    currency: str = "INR"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TransactionRow(SQLModel, table=True):
    __tablename__ = "transactions"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    account_id: str = Field(index=True)
    date: date
    amount: float
    merchant: str
    category: str
    description: str | None = None
    is_recurring: bool = False
    recurring_group_id: str | None = Field(default=None, index=True)
    tags: str | None = None  # JSON-serialized list of strings, e.g. '["Subscription"]'
    notes: str | None = None
    review_status: str = Field(default="pending", index=True)  # "pending" | "reviewed" | "skipped"
    reviewed_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategorizationRuleRow(SQLModel, table=True):
    __tablename__ = "categorization_rules"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    match_type: str = "contains"  # "contains" | "exact" | "starts_with" | "regex"
    pattern: str
    category: str
    tags: str | None = None  # JSON-serialized list of strings
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DebtRow(SQLModel, table=True):
    __tablename__ = "debts"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    account_id: str
    principal: float
    interest_rate_apr: float
    minimum_payment: float
    due_day_of_month: int


class IncomeRow(SQLModel, table=True):
    __tablename__ = "incomes"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    source: str
    amount: float
    frequency: str
    next_date: date


class GoalRow(SQLModel, table=True):
    __tablename__ = "goals"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    name: str
    target_amount: float
    target_date: date | None = None
    current_amount: float = 0
    cover_key: str = "general"
    funding_account_id: str | None = None
    auto_track: bool = False



class EventRow(SQLModel, table=True):
    """Audit log of user-triggered changes (new txn batch, new income, new
    loan, manual edit) that drive the /timeline recompute-diff view."""

    __tablename__ = "events"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    kind: str
    payload_json: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CopilotInsightRow(SQLModel, table=True):
    """Always-on copilot pop-up insight produced when new data lands."""

    __tablename__ = "copilot_insights"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    txn_id: str | None = None
    severity: str  # "info" | "positive" | "warning" | "critical"
    title: str
    body: str
    action_label: str | None = None
    action_href: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InsightsSnapshotRow(SQLModel, table=True):
    """Cached DashboardSnapshot JSON so /timeline can diff before/after
    without recomputing the "before" state."""

    __tablename__ = "insights_snapshots"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    snapshot_json: str
    health_score: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BudgetRow(SQLModel, table=True):
    """User-defined monthly spending limit per category (added by
    ledger-budgets-backend-agent). Additive -- does not alter any existing
    table/class in this file."""

    __tablename__ = "budgets"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    category: str
    monthly_limit: float
    rollover_enabled: bool = False
    rollover_cap: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLogRow(SQLModel, table=True):
    """Security audit trail: every authentication denial (401/403/429) and
    every successful data-mutating request. `user_id` is nullable because a
    denied request may fail before any user could be resolved at all (e.g.
    a malformed token) -- those rows still matter for spotting abuse
    patterns by IP/path even without an identity attached."""

    __tablename__ = "audit_logs"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str | None = Field(default=None, index=True)
    event_type: str = Field(index=True)  # "auth_denied" | "rate_limited" | "mutation"
    method: str
    path: str
    status_code: int
    client_ip: str | None = None
    detail: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)


class HouseholdRow(SQLModel, table=True):
    """Collaborative household entity linking multiple co-pilots / family members."""

    __tablename__ = "households"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    owner_user_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HouseholdMemberRow(SQLModel, table=True):
    """Membership join table mapping users to households with role permissions."""

    __tablename__ = "household_members"

    id: str = Field(default_factory=_uuid, primary_key=True)
    household_id: str = Field(index=True)
    user_id: str = Field(index=True)
    role: str = Field(default="editor")  # "owner" | "editor" | "viewer"
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Managed members (e.g. kids) have no login: user_id is a synthetic "managed-<id>" that only
    # household endpoints ever resolve, so their data never appears outside the Household section.
    is_managed: bool = False
    display_name: str | None = None
    relationship: str | None = None


class HouseholdInviteRow(SQLModel, table=True):
    """Secure hashed invitation tokens for inviting partners to a household."""

    __tablename__ = "household_invites"

    id: str = Field(default_factory=_uuid, primary_key=True)
    household_id: str = Field(index=True)
    invited_email: str = Field(index=True)
    role: str = Field(default="editor")  # "editor" | "viewer"
    token_hash: str = Field(index=True)
    status: str = Field(default="pending", index=True)  # "pending" | "accepted" | "revoked" | "expired"
    invited_by_user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime


class ConnectionRow(SQLModel, table=True):
    """A linked data source (Google Pay, bank, ...) for a user."""

    __tablename__ = "connections"

    id: str = Field(primary_key=True)  # f"{user_id}:{connector}"
    user_id: str = Field(index=True)
    connector: str
    status: str = "connected"
    detail: str | None = None  # e.g. the linked profile name
    source_url: str | None = None  # live Google Sheet CSV export URL
    content_hash: str | None = None  # last synced content, to skip no-op refreshes
    connected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InvestigationRow(SQLModel, table=True):
    """A saved Evidence Room report (JSON blob), kept so later AI features can build on it."""

    __tablename__ = "investigations"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    risk_score: int = 0
    report: str = "{}"  # JSON-serialized report dict
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)


class DocumentRow(SQLModel, table=True):
    """User-uploaded text document, chunked + embedded by app.rag."""

    __tablename__ = "documents"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    name: str
    text: str  # full extracted text, capped at 200_000 chars
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProfileRow(SQLModel, table=True):
    """What a user told us in the onboarding questionnaire (one row per user)."""

    __tablename__ = "profiles"

    id: str = Field(primary_key=True)  # = user_id
    user_id: str = Field(index=True)
    level: str = "skipped"  # basic | standard | deep | skipped
    answers: str = "{}"  # JSON-serialized {question_id: answer}
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PriceMemoryRow(SQLModel, table=True):
    """One saved quick expense: what it was, what it cost, and the photo embedding used to recognise it again."""

    __tablename__ = "price_memory"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True)
    item: str = Field(index=True)
    price: float
    category: str = "other"
    embedding: str | None = None  # JSON-serialized list of floats (CLIP image vector)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PayLimitRow(SQLModel, table=True):
    """Largest single phone payment the user allows; larger ones are refused. One row per user."""

    __tablename__ = "pay_limits"

    id: str = Field(primary_key=True)  # = user_id
    user_id: str = Field(index=True)
    per_payment: float


class PaymentReviewRow(SQLModel, table=True):
    """Automatic security review of a heavy or unusual UPI payment (see app.payment_check). `payload` is the review as JSON."""

    __tablename__ = "payment_reviews"

    id: str = Field(primary_key=True)  # same id as the transaction it reviews
    user_id: str = Field(index=True)
    payee_name: str
    amount: float
    heavy: bool = True
    verdict: str  # secure | review | suspicious
    status: str = "open"  # open | confirmed | reported | blocked (the payment was refused and nothing was booked)
    payload: str = "{}"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PairRow(SQLModel, table=True):
    """Pairing code that lets the phone pay app write to one signed-in user's ledger without a login token."""

    __tablename__ = "pay_pairs"

    id: str = Field(primary_key=True)  # the code shown on the website
    user_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    claimed_at: datetime | None = None  # first time the phone app used the code


class SharedExpenseRow(SQLModel, table=True):
    """One shared household expense ("Who owes who"). Money is stored in integer paise so splits add up exactly.
    Members are identified by household member user_id (real user ids and `managed-<hex>` ids). No `user_id` column:
    the row belongs to the household and is removed with it."""

    __tablename__ = "shared_expenses"

    id: str = Field(default_factory=_uuid, primary_key=True)
    household_id: str = Field(index=True)
    title: str
    amount_paise: int
    paid_by: str
    split_among_json: str = "[]"  # JSON-serialized list of member ids
    category: str | None = None
    date: date
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SettlementRow(SQLModel, table=True):
    """A payment between two household members that settles (part of) what they owe each other."""

    __tablename__ = "settlements"

    id: str = Field(default_factory=_uuid, primary_key=True)
    household_id: str = Field(index=True)
    from_member: str
    to_member: str
    amount_paise: int
    date: date
    note: str | None = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
