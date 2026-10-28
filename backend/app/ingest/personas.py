"""Synthetic 12-month transaction history generators for 3 demo personas.

Each persona is built from a small declarative `PersonaConfig`: a set of
accounts, a list of recurring obligations (rent/EMI/subscriptions/SIP/salary)
injected with jitter so recurring-detection has to find the periodicity
rather than read a flag, a per-category daily/weekly discretionary-spend
profile, and a handful of one-off anomalies for anomaly-detection to catch.

Two entry points:
  - `generate_persona(config) -> PersonaData` -- SQLModel row objects ready
    for bulk insert (used by `seed.py`).
  - `persona_dataframes(user_id) -> dict[str, pandas.DataFrame]` -- the same
    data as plain DataFrames, so analytics/forecast agents can import fixture
    data without touching a DB.
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from dateutil.relativedelta import relativedelta

from app.models import (
    AccountRow,
    BudgetRow,
    CategorizationRuleRow,
    DebtRow,
    GoalRow,
    IncomeRow,
    TransactionRow,
)
from app.schemas import RecurrenceFrequency, TxnCategory

MONTHS_OF_HISTORY = 12
TODAY = date.today()


# ---------------------------------------------------------------------------
# Declarative persona configuration
# ---------------------------------------------------------------------------


@dataclass
class AccountSpec:
    key: str  # local reference key, e.g. "checking"
    name: str
    type: str  # AccountType value
    balance: float
    credit_limit: float | None = None
    interest_rate_apr: float | None = None


@dataclass
class RecurringItem:
    merchant: str
    category: TxnCategory
    amount: float  # signed monthly base amount (negative = outflow)
    day_of_month: int
    account_key: str
    description: str | None = None


@dataclass
class DebtSpec:
    account_key: str
    principal: float
    interest_rate_apr: float
    minimum_payment: float
    due_day_of_month: int


@dataclass
class SpendCategorySpec:
    category: TxnCategory
    merchants: list[str]
    events_per_month: tuple[int, int]  # (low, high) count of transactions
    amount_range: tuple[float, float]  # (low, high) per-transaction outflow
    account_key: str = "checking"


@dataclass
class AnomalySpec:
    months_ago: int  # 0 = most recent month
    merchant: str
    category: TxnCategory
    amount: float
    account_key: str = "checking"
    description: str = "One-off unusual purchase"


@dataclass
class PersonaConfig:
    user_id: str
    display_name: str
    city: str
    salary: float
    salary_day: int
    accounts: list[AccountSpec]
    recurring: list[RecurringItem]
    debts: list[DebtSpec]
    daily_spend: list[SpendCategorySpec]
    anomalies: list[AnomalySpec] = field(default_factory=list)
    seed: int = 42


@dataclass
class PersonaData:
    accounts: list[AccountRow]
    transactions: list[TransactionRow]
    debts: list[DebtRow]
    incomes: list[IncomeRow]
    rules: list[CategorizationRuleRow] = field(default_factory=list)
    budgets: list[BudgetRow] = field(default_factory=list)
    goals: list[GoalRow] = field(default_factory=list)



# ---------------------------------------------------------------------------
# Persona definitions
# ---------------------------------------------------------------------------


def _priya_config() -> PersonaConfig:
    # Salaried software engineer, Bengaluru: saves ~10k SIP + ~11k free cash a month; assets comfortably exceed debt.
    return PersonaConfig(
        user_id="demo-priya",
        display_name="Priya",
        city="Bengaluru",
        salary=100_000,
        salary_day=1,
        seed=163,
        accounts=[
            AccountSpec("checking", "Priya Checking - HDFC", "checking", balance=85_000),
            AccountSpec("savings", "Priya Savings - HDFC", "savings", balance=320_000),
            AccountSpec("credit_card", "Priya Credit Card - HDFC Regalia", "credit_card", balance=-18_500, credit_limit=150_000, interest_rate_apr=42.0),
            AccountSpec("car_loan", "Priya Car Loan - HDFC Auto", "loan", balance=-300_000, interest_rate_apr=9.5),
            AccountSpec("invest", "Priya Zerodha Coin", "investment", balance=450_000),
        ],
        recurring=[
            RecurringItem("Employer Payroll", TxnCategory.income, 100_000, 1, "checking", "Monthly salary credit"),
            RecurringItem("Prestige Lakeview Apts", TxnCategory.rent_housing, -30_000, 5, "checking"),
            RecurringItem("HDFC Auto Loan EMI", TxnCategory.emi_loan, -12_500, 10, "checking"),
            RecurringItem("BESCOM Electricity Bill", TxnCategory.utilities, -1_800, 12, "checking"),
            RecurringItem("Netflix", TxnCategory.subscriptions, -649, 14, "credit_card"),
            RecurringItem("Spotify", TxnCategory.subscriptions, -119, 16, "credit_card"),
            RecurringItem("Amazon Prime Video", TxnCategory.subscriptions, -299, 18, "credit_card"),
            RecurringItem("JioFiber Broadband", TxnCategory.subscriptions, -999, 8, "checking"),
            RecurringItem("Cult.fit Membership", TxnCategory.subscriptions, -1499, 20, "credit_card"),
            RecurringItem("Airtel Postpaid Recharge", TxnCategory.subscriptions, -599, 22, "checking"),
            RecurringItem("Zerodha Coin SIP", TxnCategory.investment_sip, -10_000, 3, "checking"),
            RecurringItem("HDFC Credit Card Bill Payment", TxnCategory.credit_card_payment, -15_000, 18, "checking"),
        ],
        debts=[
            DebtSpec("car_loan", principal=300_000, interest_rate_apr=9.5, minimum_payment=12_500, due_day_of_month=10),
            DebtSpec("credit_card", principal=18_500, interest_rate_apr=42.0, minimum_payment=925, due_day_of_month=18),
        ],
        daily_spend=[
            SpendCategorySpec(TxnCategory.groceries, ["BigBasket", "DMart", "Zepto"], (5, 7), (600, 2800)),
            SpendCategorySpec(TxnCategory.dining, ["Swiggy", "Zomato", "Starbucks", "Third Wave Coffee"], (6, 8), (250, 1400), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.transport, ["Uber", "Ola", "Indian Oil Petrol Pump"], (6, 9), (150, 1500)),
            SpendCategorySpec(TxnCategory.shopping, ["Amazon.in", "Myntra", "Nykaa"], (2, 4), (500, 4500), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.entertainment, ["PVR Cinemas", "BookMyShow"], (1, 3), (300, 1200), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.healthcare, ["Apollo Pharmacy", "PharmEasy"], (1, 2), (200, 1500)),
        ],
        anomalies=[
            AnomalySpec(months_ago=5, merchant="Croma Electronics", category=TxnCategory.shopping, amount=-42_000, account_key="credit_card", description="One-time laptop purchase"),
            AnomalySpec(months_ago=7, merchant="Goibibo Flight Booking", category=TxnCategory.transport, amount=-18_500, account_key="credit_card", description="Vacation flight"),
        ],
    )


def _arjun_config() -> PersonaConfig:
    # Senior manager, Mumbai, two children: the home loan is well covered by savings and investments.
    return PersonaConfig(
        user_id="demo-arjun",
        display_name="Arjun",
        city="Mumbai",
        salary=180_000,
        salary_day=1,
        seed=210,
        accounts=[
            AccountSpec("checking", "Arjun Checking - ICICI", "checking", balance=320_000),
            AccountSpec("savings", "Arjun Savings - ICICI", "savings", balance=1_100_000),
            AccountSpec("credit_card", "Arjun Credit Card - ICICI Amazon Pay", "credit_card", balance=-22_000, credit_limit=300_000, interest_rate_apr=39.0),
            AccountSpec("home_loan", "Arjun Home Loan - ICICI", "loan", balance=-2_200_000, interest_rate_apr=8.6),
            AccountSpec("invest", "Arjun Groww Mutual Funds", "investment", balance=2_000_000),
        ],
        recurring=[
            RecurringItem("Employer Payroll", TxnCategory.income, 180_000, 1, "checking", "Monthly salary credit"),
            RecurringItem("ICICI Home Loan EMI", TxnCategory.emi_loan, -28_000, 5, "checking"),
            RecurringItem("Society Maintenance", TxnCategory.rent_housing, -5_500, 4, "checking"),
            RecurringItem("Greenwood High School Fees", TxnCategory.education, -18_000, 7, "checking", "Recurring school fees - child 1"),
            RecurringItem("Podar International School Fees", TxnCategory.education, -14_000, 7, "checking", "Recurring school fees - child 2"),
            RecurringItem("Netflix", TxnCategory.subscriptions, -649, 12, "credit_card"),
            RecurringItem("Amazon Prime", TxnCategory.subscriptions, -299, 15, "credit_card"),
            RecurringItem("Hotstar Premium", TxnCategory.subscriptions, -299, 17, "credit_card"),
            RecurringItem("Tata Power Electricity Bill", TxnCategory.utilities, -4200, 9, "checking"),
            RecurringItem("Piped Gas Bill", TxnCategory.utilities, -1400, 11, "checking"),
            RecurringItem("Groww Mutual Fund SIP", TxnCategory.investment_sip, -20_000, 3, "checking"),
            RecurringItem("ICICI Credit Card Bill Payment", TxnCategory.credit_card_payment, -22_000, 20, "checking"),
        ],
        debts=[
            DebtSpec("home_loan", principal=2_200_000, interest_rate_apr=8.6, minimum_payment=28_000, due_day_of_month=5),
        ],
        daily_spend=[
            SpendCategorySpec(TxnCategory.groceries, ["DMart", "Nature's Basket", "BigBasket"], (5, 7), (1000, 4600)),
            SpendCategorySpec(TxnCategory.dining, ["Zomato", "Barbeque Nation", "Cafe Coffee Day"], (6, 9), (400, 1800), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.transport, ["Uber", "Indian Oil Petrol Pump", "Mumbai Metro"], (6, 9), (250, 1800)),
            SpendCategorySpec(TxnCategory.shopping, ["Amazon.in", "Reliance Digital", "Decathlon"], (3, 5), (800, 5000), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.entertainment, ["PVR Cinemas", "BookMyShow"], (2, 3), (500, 2000), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.healthcare, ["Apollo Pharmacy", "Practo"], (1, 2), (500, 4500)),
        ],
        anomalies=[
            AnomalySpec(months_ago=5, merchant="Taj Hotels Booking", category=TxnCategory.entertainment, amount=-45_000, account_key="credit_card", description="Family vacation"),
        ],
    )


def _meera_config() -> PersonaConfig:
    # Freelance designer, Pune: income swings month to month, but small savings cushion.
    return PersonaConfig(
        user_id="demo-meera",
        display_name="Meera",
        city="Pune",
        salary=52_000,
        salary_day=1,
        seed=305,
        accounts=[
            AccountSpec("checking", "Meera Checking - Kotak", "checking", balance=14_000),
            AccountSpec("savings", "Meera Savings - Kotak", "savings", balance=55_000),
            AccountSpec("credit_card", "Meera Credit Card - Kotak", "credit_card", balance=-9_000, credit_limit=60_000, interest_rate_apr=45.0),
            AccountSpec("student_loan", "Meera Student Loan - SBI", "loan", balance=-90_000, interest_rate_apr=10.5),
            AccountSpec("invest", "Meera Groww SIP", "investment", balance=60_000),
        ],
        recurring=[
            RecurringItem("Employer Payroll", TxnCategory.income, 52_000, 1, "checking", "Monthly freelance and retainer income"),
            RecurringItem("Shared PG Rent", TxnCategory.rent_housing, -12_000, 3, "checking"),
            RecurringItem("SBI Student Loan EMI", TxnCategory.emi_loan, -4_800, 7, "checking"),
            RecurringItem("Groww Mutual Fund SIP", TxnCategory.investment_sip, -3_000, 5, "checking"),
            RecurringItem("Netflix", TxnCategory.subscriptions, -649, 12, "credit_card"),
            RecurringItem("Spotify", TxnCategory.subscriptions, -119, 14, "credit_card"),
            RecurringItem("Airtel Postpaid Recharge", TxnCategory.subscriptions, -499, 19, "checking"),
            RecurringItem("Kotak Credit Card Bill Payment", TxnCategory.credit_card_payment, -8_000, 22, "checking"),
        ],
        debts=[
            DebtSpec("student_loan", principal=90_000, interest_rate_apr=10.5, minimum_payment=4_800, due_day_of_month=7),
        ],
        daily_spend=[
            SpendCategorySpec(TxnCategory.groceries, ["Zepto", "Blinkit", "DMart"], (4, 6), (350, 1300)),
            SpendCategorySpec(TxnCategory.dining, ["Swiggy", "Zomato", "Starbucks", "Domino's Pizza"], (7, 10), (200, 900), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.transport, ["Uber", "Ola", "Rapido"], (8, 12), (100, 600)),
            SpendCategorySpec(TxnCategory.shopping, ["Myntra", "Meesho", "Ajio", "Amazon.in"], (2, 4), (400, 3000), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.entertainment, ["PVR Cinemas", "BookMyShow"], (1, 3), (250, 900), account_key="credit_card"),
        ],
        anomalies=[
            AnomalySpec(months_ago=5, merchant="Reliance Digital", category=TxnCategory.shopping, amount=-9_000, account_key="credit_card", description="Headphones"),
        ],
    )


PERSONA_CONFIGS: dict[str, PersonaConfig] = {
    "demo-priya": _priya_config(),
    "demo-arjun": _arjun_config(),
    "demo-meera": _meera_config(),
}


# ---------------------------------------------------------------------------
# Priya's household (synthetic): Rishi, Swara and Vedant. They are NOT demo personas -- they have no dashboard of
# their own -- they exist so the Household page can show what each family member spends. Everything is generated.
# ---------------------------------------------------------------------------

# user_id -> (display name, relation to the household owner Priya)
FAMILY_MEMBERS: dict[str, tuple[str, str]] = {
    "demo-priya": ("Priya", "Mother"),
    "demo-rishi": ("Rishi", "Husband"),
    "demo-swara": ("Swara", "Daughter"),
    "demo-vedant": ("Vedant", "Son"),
}


def _rishi_config() -> PersonaConfig:
    return PersonaConfig(
        user_id="demo-rishi", display_name="Rishi", city="Bengaluru", salary=85_000, salary_day=1, seed=411,
        accounts=[
            AccountSpec("checking", "Rishi Checking - SBI", "checking", balance=58_000),
            AccountSpec("savings", "Rishi Savings - SBI", "savings", balance=220_000),
            AccountSpec("credit_card", "Rishi Credit Card - Axis Magnus", "credit_card", balance=-14_000, credit_limit=100_000, interest_rate_apr=40.0),
            AccountSpec("invest", "Rishi Groww Mutual Funds", "investment", balance=140_000),
        ],
        recurring=[
            RecurringItem("Employer Payroll", TxnCategory.income, 85_000, 1, "checking", "Monthly salary credit"),
            RecurringItem("Groww Index Fund SIP", TxnCategory.investment_sip, -10_000, 4, "checking"),
            RecurringItem("LIC Life Insurance Premium", TxnCategory.other, -2_800, 12, "checking"),
            RecurringItem("Jio Postpaid Recharge", TxnCategory.subscriptions, -799, 15, "checking"),
            RecurringItem("Hotstar Premium", TxnCategory.subscriptions, -299, 19, "credit_card"),
            RecurringItem("Axis Credit Card Bill Payment", TxnCategory.credit_card_payment, -9_000, 20, "checking"),
        ],
        debts=[],
        daily_spend=[
            SpendCategorySpec(TxnCategory.transport, ["Indian Oil Petrol Pump", "Uber", "FASTag Recharge", "Namma Metro"], (8, 12), (150, 1_800)),
            SpendCategorySpec(TxnCategory.dining, ["Swiggy", "Zomato", "Domino's Pizza", "Truffles"], (6, 10), (200, 1_100), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.shopping, ["Amazon.in", "Decathlon", "Croma"], (1, 3), (500, 4_500), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.entertainment, ["BookMyShow", "PVR Cinemas"], (1, 2), (300, 1_400), account_key="credit_card"),
            SpendCategorySpec(TxnCategory.healthcare, ["Apollo Pharmacy", "Cult.fit"], (1, 2), (300, 2_000)),
        ],
    )


def _swara_config() -> PersonaConfig:
    return PersonaConfig(
        user_id="demo-swara", display_name="Swara", city="Bengaluru", salary=4_000, salary_day=1, seed=512,
        accounts=[
            AccountSpec("checking", "Swara Pocket Wallet - Paytm", "checking", balance=2_800),
            AccountSpec("savings", "Swara Savings - SBI Kids", "savings", balance=18_000),
        ],
        recurring=[
            RecurringItem("Pocket Money from Mom", TxnCategory.income, 4_000, 1, "checking", "Monthly pocket money"),
            RecurringItem("Spotify Student", TxnCategory.subscriptions, -59, 8, "checking"),
        ],
        debts=[],
        daily_spend=[
            SpendCategorySpec(TxnCategory.dining, ["Starbucks", "Chai Point", "Domino's Pizza", "Third Wave Coffee"], (6, 10), (80, 450)),
            SpendCategorySpec(TxnCategory.shopping, ["Myntra", "Nykaa", "Crossword Bookstore", "Amazon.in"], (2, 4), (200, 1_500)),
            SpendCategorySpec(TxnCategory.entertainment, ["BookMyShow", "Spotify Concert Pass"], (1, 2), (150, 500)),
            SpendCategorySpec(TxnCategory.transport, ["Rapido", "Uber"], (3, 6), (60, 250)),
        ],
    )


def _vedant_config() -> PersonaConfig:
    return PersonaConfig(
        user_id="demo-vedant", display_name="Vedant", city="Bengaluru", salary=2_000, salary_day=1, seed=613,
        accounts=[
            AccountSpec("checking", "Vedant Piggy Wallet - PhonePe", "checking", balance=1_200),
            AccountSpec("savings", "Vedant Savings - SBI Kids", "savings", balance=9_500),
        ],
        recurring=[
            RecurringItem("Pocket Money from Mom", TxnCategory.income, 2_000, 1, "checking", "Monthly pocket money"),
            RecurringItem("Google Play Pass", TxnCategory.subscriptions, -99, 10, "checking"),
        ],
        debts=[],
        daily_spend=[
            SpendCategorySpec(TxnCategory.dining, ["School Canteen", "Baskin Robbins", "Chai Point", "Burger King"], (6, 9), (40, 250)),
            SpendCategorySpec(TxnCategory.entertainment, ["Google Play Games", "Steam Wallet", "Roblox Gift Card"], (2, 3), (79, 399)),
            SpendCategorySpec(TxnCategory.shopping, ["Decathlon", "Crossword Bookstore", "Hamleys"], (1, 2), (120, 700)),
        ],
    )


FAMILY_CONFIGS: dict[str, PersonaConfig] = {
    "demo-rishi": _rishi_config(),
    "demo-swara": _swara_config(),
    "demo-vedant": _vedant_config(),
}


# ---------------------------------------------------------------------------
# Generation engine
# ---------------------------------------------------------------------------


# Declared plan inputs for the /plan page (reserve + savings/debt goal in INR);
# api/plan_router.py uses them as defaults when a demo user passes none.
PLAN_PROFILES: dict[str, dict[str, float | int]] = {
    "demo-priya": {"reserve": 40_000, "goal_amount": 60_000, "goal_month": 6},
    "demo-arjun": {"reserve": 300_000, "goal_amount": 400_000, "goal_month": 6},
    "demo-meera": {"reserve": 60_000, "goal_amount": 200_000, "goal_month": 6},
}


def _month_anchors(months: int = MONTHS_OF_HISTORY) -> list[date]:
    """First-of-month anchors for the last `months` months, oldest first."""
    anchors = []
    for i in range(months - 1, -1, -1):
        anchors.append((TODAY.replace(day=1) - relativedelta(months=i)))
    return anchors


def _safe_day(anchor: date, day_of_month: int) -> date:
    """Clamp day_of_month to the number of days actually in `anchor`'s month."""
    next_month = anchor.replace(day=28) + timedelta(days=4)
    last_day = (next_month - timedelta(days=next_month.day)).day
    return anchor.replace(day=min(day_of_month, last_day))


# Per-persona lifestyle creep (monthly growth) on discretionary categories.
_CREEP: dict[str, tuple[float, set[str]]] = {
    "demo-priya": (1.03, {"dining", "shopping", "entertainment"}),
    "demo-arjun": (1.008, {"groceries", "dining", "shopping", "entertainment", "transport"}),
}
# Meera's freelance income by month index (oldest first): 3 strong, 2 lean, a late invoice, repeat.
_MEERA_INCOME = [1.15, 1.2, 1.1, 0.4, 0.3, 0.9, 1.2, 1.1, 1.05, 0.4, 0.3, 1.0]
_FESTIVE = {"shopping", "entertainment", "dining"}


def _lognormal(rng: random.Random, lo: float, hi: float) -> float:
    """Right-skewed amount: most near the geometric middle, a few large ones, clipped."""
    x = rng.lognormvariate(math.log(math.sqrt(lo * hi)), math.log(hi / lo) / 6)
    return min(max(x, lo * 0.7), hi * 1.15)


def _month_factor(user_id: str, category: str, month_idx: int, anchor: date) -> float:
    growth, cats = _CREEP.get(user_id, (1.0, set()))
    f = growth**month_idx if category in cats else 1.0
    if category in _FESTIVE:
        f *= {10: 1.35, 11: 1.35, 12: 0.8}.get(anchor.month, 1.0)  # Diwali spike, then post-spike dip
    return f


def _fishy_rows(user_id: str, acc: dict[str, AccountRow]) -> list[TransactionRow]:
    """Deterministic suspicious rows (tags JSON always contains "fishy") for the Evidence Room demo."""
    out: list[TransactionRow] = []

    def add(days_ago, amount, merchant, cat, kind, key="credit_card", desc=None, rec=False):
        out.append(TransactionRow(
            user_id=user_id, account_id=acc[key].id, date=TODAY - timedelta(days=days_ago),
            amount=amount, merchant=merchant, category=cat, description=desc, is_recurring=rec,
            recurring_group_id=f"rec-{user_id}-{merchant.lower().replace(' ', '-')}" if rec else None,
            tags=json.dumps(["fishy", kind]),
        ))

    if user_id == "demo-priya":
        add(12, -849.0, "Zomato", "dining", "duplicate")  # charged twice
        add(12, -849.0, "Zomato", "dining", "duplicate")
        add(20, -7499.0, "Amaz0n Pay Seller", "shopping", "lookalike")
    elif user_id == "demo-arjun":
        add(8, -899.0, "Zomat0", "dining", "lookalike")  # the duplicate EMI debit is added in generate_persona
    elif user_id == "demo-meera":
        add(16, -380.0, "Swiggy", "dining", "duplicate")  # charged twice
        add(16, -380.0, "Swiggy", "dining", "duplicate")
    return out


def generate_persona(config: PersonaConfig) -> PersonaData:
    rng = random.Random(config.seed)

    accounts_by_key: dict[str, AccountRow] = {}
    for spec in config.accounts:
        row = AccountRow(
            user_id=config.user_id,
            name=spec.name,
            type=spec.type,
            balance=spec.balance,
            credit_limit=spec.credit_limit,
            interest_rate_apr=spec.interest_rate_apr,
        )
        accounts_by_key[spec.key] = row

    transactions: list[TransactionRow] = []
    anchors = _month_anchors()

    # Recurring obligations, one group id per merchant so a recurring-detector
    # can also cross-check against the (deliberately absent) explicit label.
    for item in config.recurring:
        group_id = f"rec-{config.user_id}-{item.merchant.lower().replace(' ', '-')}"
        for anchor in anchors:
            jitter_days = rng.randint(-2, 2)
            jitter_pct = rng.uniform(-0.03, 0.03)
            txn_date = _safe_day(anchor, item.day_of_month) + timedelta(days=jitter_days)
            if txn_date > TODAY:
                continue
            amount = round(item.amount * (1 + jitter_pct), 2)
            if config.user_id == "demo-meera" and item.category == TxnCategory.income:
                mult = _MEERA_INCOME[anchors.index(anchor)]
                if mult == 0:
                    continue
                amount = round(amount * mult, 2)
                if mult == 0.9:  # invoice paid late
                    txn_date = txn_date + timedelta(days=23)
            transactions.append(
                TransactionRow(
                    user_id=config.user_id,
                    account_id=accounts_by_key[item.account_key].id,
                    date=txn_date,
                    amount=amount,
                    merchant=item.merchant,
                    category=item.category.value,
                    description=item.description,
                    is_recurring=True,
                    recurring_group_id=group_id,
                )
            )

    # Discretionary daily/weekly spend, spread randomly across each month.
    for spec in config.daily_spend:
        for month_idx, anchor in enumerate(anchors):
            next_month = anchor.replace(day=28) + timedelta(days=4)
            days_in_month = (next_month - timedelta(days=next_month.day)).day
            days_avail = min(days_in_month, (TODAY - anchor).days + 1)  # no future-dated spend
            factor = _month_factor(config.user_id, spec.category.value, month_idx, anchor)
            # creep and festival effects scale how often she spends, keeping per-txn amounts stationary
            n_events = round(rng.randint(*spec.events_per_month) * factor * days_avail / days_in_month)
            for _ in range(n_events):
                day_offset = rng.randint(0, days_avail - 1)
                txn_date = anchor + timedelta(days=day_offset)
                amount = -round(_lognormal(rng, *spec.amount_range), 2)
                merchant = rng.choice(spec.merchants)
                transactions.append(
                    TransactionRow(
                        user_id=config.user_id,
                        account_id=accounts_by_key[spec.account_key].id,
                        date=txn_date,
                        amount=amount,
                        merchant=merchant,
                        category=spec.category.value,
                        description=None,
                        is_recurring=False,
                        recurring_group_id=None,
                    )
                )

    # One-off anomalies.
    for anomaly in config.anomalies:
        anchor = anchors[max(0, len(anchors) - 1 - anomaly.months_ago)]
        day_offset = rng.randint(0, 27)
        txn_date = anchor + timedelta(days=day_offset)
        transactions.append(
            TransactionRow(
                user_id=config.user_id,
                account_id=accounts_by_key[anomaly.account_key].id,
                date=txn_date,
                amount=anomaly.amount,
                merchant=anomaly.merchant,
                category=anomaly.category.value,
                description=anomaly.description,
                is_recurring=False,
                recurring_group_id=None,
            )
        )

    fishy = _fishy_rows(config.user_id, accounts_by_key)
    burst_days = {t.date for t in fishy if "burst" in (t.tags or "")}
    # a burst day holds only the burst, so the pattern detector sees a single merchant
    transactions = [t for t in transactions if t.date not in burst_days]
    if config.user_id == "demo-arjun":  # duplicate EMI debit: the latest EMI plus an identical copy
        emi = max((t for t in transactions if t.merchant == "ICICI Home Loan EMI"), key=lambda t: t.date)
        emi.is_recurring, emi.tags = False, json.dumps(["fishy", "duplicate_emi"])
        fishy.append(emi.model_copy(update={"id": TransactionRow().id, "date": emi.date + timedelta(days=1)}))
    transactions += fishy

    transactions.sort(key=lambda t: t.date)

    now = datetime.now(timezone.utc)
    pending_cutoff = max(0, len(transactions) - 4)
    for idx, txn in enumerate(transactions):
        cat = txn.category
        tags: list[str] = json.loads(txn.tags) if txn.tags else []  # injected rows keep their own tags
        if tags:
            pass
        elif cat == "subscriptions":
            tags = ["Subscription"]
        elif cat == "investment_sip":
            tags = ["SIP", "Tax-Deductible"]
        elif cat == "groceries":
            tags = ["Essentials"]
        elif cat == "dining":
            tags = ["Food"]
        elif cat == "rent_housing":
            tags = ["Housing", "Fixed"]
        elif cat == "utilities":
            tags = ["Bills"]
        elif cat == "healthcare":
            tags = ["Health", "80D"]
        elif cat == "shopping":
            tags = ["Discretionary"]

        if idx >= pending_cutoff:
            txn.review_status = "pending"
            txn.tags = json.dumps(tags) if tags else None
            txn.reviewed_at = None
        else:
            txn.review_status = "reviewed"
            txn.tags = json.dumps(tags) if tags else None
            txn.reviewed_at = now

    debts = [
        DebtRow(
            user_id=config.user_id,
            account_id=accounts_by_key[spec.account_key].id,
            principal=spec.principal,
            interest_rate_apr=spec.interest_rate_apr,
            minimum_payment=spec.minimum_payment,
            due_day_of_month=spec.due_day_of_month,
        )
        for spec in config.debts
    ]

    incomes = [
        IncomeRow(
            user_id=config.user_id,
            source="Employer Payroll",
            amount=config.salary,
            frequency=RecurrenceFrequency.monthly.value,
            next_date=_safe_day(anchors[-1] + relativedelta(months=1), config.salary_day),
        )
    ]

    rules = [
        CategorizationRuleRow(
            user_id=config.user_id,
            match_type="contains",
            pattern="Netflix",
            category=TxnCategory.subscriptions.value,
            tags=json.dumps(["Subscription"]),
        ),
        CategorizationRuleRow(
            user_id=config.user_id,
            match_type="contains",
            pattern="Swiggy",
            category=TxnCategory.dining.value,
            tags=json.dumps(["Food"]),
        ),
    ]

    budgets = [
        BudgetRow(
            user_id=config.user_id,
            category=TxnCategory.dining.value,
            monthly_limit=12_000,
            rollover_enabled=True,
            rollover_cap=6000,
        ),
        BudgetRow(
            user_id=config.user_id,
            category=TxnCategory.groceries.value,
            monthly_limit=15_000,
            rollover_enabled=True,
            rollover_cap=5000,
        ),
        BudgetRow(
            user_id=config.user_id,
            category=TxnCategory.transport.value,
            monthly_limit=8_000,
            rollover_enabled=True,
            rollover_cap=3000,
        ),
        BudgetRow(
            user_id=config.user_id,
            category=TxnCategory.shopping.value,
            monthly_limit=10_000,
            rollover_enabled=False,
        ),
        BudgetRow(
            user_id=config.user_id,
            category=TxnCategory.subscriptions.value,
            monthly_limit=5_000,
            rollover_enabled=False,
        ),
    ]

    if config.user_id == "demo-priya":
        goals = [
            GoalRow(
                user_id=config.user_id,
                name="Emergency Fund",
                target_amount=500_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=8), 15),
                current_amount=320_000,
                cover_key="emergency_fund",
                funding_account_id=accounts_by_key["savings"].id if "savings" in accounts_by_key else None,
                auto_track=True,
            ),
            GoalRow(
                user_id=config.user_id,
                name="Dream Car (EV)",
                target_amount=1_800_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=18), 1),
                current_amount=350_000,
                cover_key="dream_car",
                funding_account_id=None,
                auto_track=False,
            ),
            GoalRow(
                user_id=config.user_id,
                name="Japan Cherry Blossom Trip",
                target_amount=350_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=12), 1),
                current_amount=120_000,
                cover_key="luxury_travel",
                funding_account_id=None,
                auto_track=False,
            ),
        ]
    elif config.user_id == "demo-arjun":
        goals = [
            GoalRow(
                user_id=config.user_id,
                name="Kids Higher Education",
                target_amount=2_500_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=36), 1),
                current_amount=1_200_000,
                cover_key="higher_education",
                funding_account_id=accounts_by_key["invest"].id if "invest" in accounts_by_key else None,
                auto_track=True,
            ),
            GoalRow(
                user_id=config.user_id,
                name="Family Europe Vacation",
                target_amount=600_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=14), 1),
                current_amount=200_000,
                cover_key="luxury_travel",
                funding_account_id=None,
                auto_track=False,
            ),
        ]
    elif config.user_id == "demo-meera":
        goals = [
            GoalRow(
                user_id=config.user_id,
                name="Pay Off Student Loan Early",
                target_amount=90_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=24), 1),
                current_amount=30_000,
                cover_key="emergency_fund",
                funding_account_id=accounts_by_key["savings"].id if "savings" in accounts_by_key else None,
                auto_track=True,
            ),
            GoalRow(
                user_id=config.user_id,
                name="MacBook Pro M-Series",
                target_amount=180_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=9), 1),
                current_amount=35_000,
                cover_key="tech_setup",
                funding_account_id=None,
                auto_track=False,
            ),
        ]
    else:
        goals = [
            GoalRow(
                user_id=config.user_id,
                name="Emergency Fund",
                target_amount=300_000,
                target_date=_safe_day(anchors[-1] + relativedelta(months=12), 1),
                current_amount=50_000,
                cover_key="emergency_fund",
                funding_account_id=None,
                auto_track=False,
            )
        ]

    return PersonaData(
        accounts=list(accounts_by_key.values()),
        transactions=transactions,
        debts=debts,
        incomes=incomes,
        rules=rules,
        budgets=budgets,
        goals=goals,
    )



def generate_all_personas() -> dict[str, PersonaData]:
    return {user_id: generate_persona(cfg) for user_id, cfg in PERSONA_CONFIGS.items()}


# ---------------------------------------------------------------------------
# DataFrame fixtures (no DB required) -- for analytics-agent / forecast-sim-agent
# ---------------------------------------------------------------------------


def persona_dataframes(user_id: str) -> dict[str, pd.DataFrame]:
    """Return {"accounts", "transactions", "debts", "incomes"} as plain
    pandas DataFrames for a given demo user_id, with no DB dependency."""
    if user_id not in PERSONA_CONFIGS:
        raise KeyError(f"Unknown demo persona user_id: {user_id!r}")
    data = generate_persona(PERSONA_CONFIGS[user_id])

    accounts_df = pd.DataFrame([a.model_dump() for a in data.accounts])
    transactions_df = pd.DataFrame([t.model_dump() for t in data.transactions])
    debts_df = pd.DataFrame([d.model_dump() for d in data.debts])
    incomes_df = pd.DataFrame([i.model_dump() for i in data.incomes])

    if not transactions_df.empty:
        transactions_df["date"] = pd.to_datetime(transactions_df["date"])
        transactions_df = transactions_df.sort_values("date").reset_index(drop=True)

    return {
        "accounts": accounts_df,
        "transactions": transactions_df,
        "debts": debts_df,
        "incomes": incomes_df,
    }


def all_persona_dataframes() -> dict[str, dict[str, pd.DataFrame]]:
    return {user_id: persona_dataframes(user_id) for user_id in PERSONA_CONFIGS}
