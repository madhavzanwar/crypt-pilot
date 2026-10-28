"""Anomaly detection over a transactions DataFrame.

Flags:
  1. Statistical outliers: Transactions > 2.5 std-dev above the rolling per-category mean,
     using only prior same-category samples (min 5) incrementally.
  2. Outsized new merchants: A never-seen-before merchant whose amount is > 3x the
     historical category median.
  3. Accidental duplicate debits: Identical or near-identical outflow amounts at the
     same merchant within 48 hours (e.g. payment gateway double-charge or double swipe).
  4. Subscription price creep: Established recurring merchant outflows that jump
     >= 15% (and >= ₹50) above their historical median baseline.
  5. High-frequency velocity surges: Sudden bursts of >= 4 transactions on a single
     calendar day in a discretionary spending category exceeding typical volume.

Returns `Fact` objects (schemas.py) with self-contained, human-readable text.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
import statistics

import pandas as pd

from app.analytics.recurring import normalize_merchant
from app.schemas import Fact

_MIN_PRIOR_SAMPLES = 5
_STD_DEV_THRESHOLD = 2.5
_NEW_MERCHANT_MULTIPLE = 3.0
_SUBSCRIPTION_CREEP_THRESHOLD = 0.15
_SUBSCRIPTION_MIN_HISTORY = 3
_MIN_CREEP_DELTA = 50.0
_VELOCITY_DAILY_MIN_TXNS = 4
_DISCRETIONARY_CATEGORIES = {
    "dining",
    "shopping",
    "entertainment",
    "transport",
    "other",
}
_RECURRING_CATEGORIES = {
    "subscriptions",
    "utilities",
    "emi_loan",
    "fees_interest",
    "education",
    "rent_housing",
}


def _coefficient_of_variation(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = statistics.mean(values)
    if mean == 0:
        return 0.0
    return abs(statistics.pstdev(values) / mean)


def detect_anomalies(df: pd.DataFrame) -> list[Fact]:
    """Only considers outflows (amount < 0); inflows (salary, refunds) are
    not spend anomalies in this sense."""
    if df.empty:
        return []

    work = df.copy()
    work["date"] = pd.to_datetime(work["date"])
    work = work.sort_values("date").reset_index(drop=True)
    work = work[work["amount"] < 0].copy()
    if work.empty:
        return []
    work["abs_amount"] = -work["amount"]

    facts: list[Fact] = []

    # running per-category history, in chronological order
    category_history: dict[str, list[float]] = {}
    seen_merchants: set[str] = set()

    # tracking merchant history for price creep and duplicate debits
    merchant_history: dict[str, list[float]] = defaultdict(list)
    merchant_recent_txns: dict[str, list[dict]] = defaultdict(list)
    flagged_duplicate_ids: set[str] = set()

    # tracking calendar day transaction counts per category for velocity surge
    day_category_txns: dict[tuple[date, str], list[dict]] = defaultdict(list)

    for _, row in work.iterrows():
        category = str(row["category"])
        merchant = str(row["merchant"])
        norm_merchant = normalize_merchant(merchant)
        amount = float(row["abs_amount"])
        txn_id = str(row.get("id", "")) if pd.notna(row.get("id")) else ""
        row_dt = row["date"]
        when = row_dt.date()

        prior = category_history.setdefault(category, [])
        m_prior = merchant_history[norm_merchant]

        # --- rule 1: statistical outlier vs prior same-category spend ------
        if len(prior) >= _MIN_PRIOR_SAMPLES:
            mean = statistics.mean(prior)
            stdev = statistics.pstdev(prior)
            if stdev > 0:
                z = (amount - mean) / stdev
                if z > _STD_DEV_THRESHOLD:
                    multiple = amount / mean if mean > 0 else float("inf")
                    facts.append(
                        Fact(
                            text=(
                                f"An unusually large ₹{amount:,.0f} transaction at "
                                f"{merchant} on {when.isoformat()} is {multiple:.1f}x "
                                f"your typical spend in {category}."
                            ),
                            value=amount,
                            source_txn_ids=[txn_id] if txn_id else [],
                        )
                    )

        # --- rule 2: brand-new merchant at an outsized amount ---------------
        if merchant not in seen_merchants and len(prior) >= 1:
            median = statistics.median(prior)
            if median > 0 and amount > _NEW_MERCHANT_MULTIPLE * median:
                multiple = amount / median
                facts.append(
                    Fact(
                        text=(
                            f"A new merchant, {merchant}, charged ₹{amount:,.0f} on "
                            f"{when.isoformat()} -- {multiple:.1f}x the median "
                            f"{category} transaction, and you have no prior history "
                            f"with this merchant."
                        ),
                        value=amount,
                        source_txn_ids=[txn_id] if txn_id else [],
                    )
                )

        # --- rule 3: accidental duplicate debit detection -------------------
        for prev in reversed(merchant_recent_txns[norm_merchant]):
            prev_dt = prev["dt"]
            prev_amt = prev["amt"]
            prev_id = prev["id"]
            prev_when = prev_dt.date()
            diff_hours = abs((row_dt - prev_dt).total_seconds()) / 3600.0

            # Match within 48h for recurring/bills, or same date / tight window for retail
            is_same_day = (when == prev_when)
            is_tight_bill = (category in _RECURRING_CATEGORIES and diff_hours <= 48.0)
            is_tight_hours = (diff_hours <= 12.0)

            if is_same_day or is_tight_bill or is_tight_hours:
                # Amounts identical or within 0.5% tolerance (e.g. gateway surcharge)
                if abs(amount - prev_amt) <= max(1.0, 0.005 * prev_amt):
                    pair_key = (prev_id, txn_id)
                    if prev_id not in flagged_duplicate_ids and txn_id not in flagged_duplicate_ids:
                        if prev_id:
                            flagged_duplicate_ids.add(prev_id)
                        if txn_id:
                            flagged_duplicate_ids.add(txn_id)
                        source_ids = [tid for tid in (prev_id, txn_id) if tid]
                        facts.append(
                            Fact(
                                text=(
                                    f"Potential duplicate debit detected: ₹{amount:,.0f} charged at "
                                    f"{merchant} on {when.isoformat()} matches a ₹{prev_amt:,.0f} debit on "
                                    f"{prev_when.isoformat()} within 48 hours."
                                ),
                                value=amount,
                                source_txn_ids=source_ids,
                            )
                        )
                        break

        # --- rule 4: subscription price creep / silent escalation -----------
        if len(m_prior) >= _SUBSCRIPTION_MIN_HISTORY:
            prior_cov = _coefficient_of_variation(m_prior)
            # If the merchant previously exhibited stable charges (cov <= 0.10) or is in recurring category
            if prior_cov <= 0.10 or category in _RECURRING_CATEGORIES:
                m_median = statistics.median(m_prior)
                if m_median > 0:
                    diff_amt = amount - m_median
                    pct_increase = diff_amt / m_median
                    if pct_increase >= _SUBSCRIPTION_CREEP_THRESHOLD and diff_amt >= _MIN_CREEP_DELTA:
                        facts.append(
                            Fact(
                                text=(
                                    f"Subscription price increase detected: {merchant} charged ₹{amount:,.0f} on "
                                    f"{when.isoformat()}, which is ₹{diff_amt:,.0f} (+{pct_increase * 100:.0f}%) "
                                    f"higher than your historical median of ₹{m_median:,.0f}."
                                ),
                                value=diff_amt,
                                source_txn_ids=[txn_id] if txn_id else [],
                            )
                        )

        # Track history
        seen_merchants.add(merchant)
        prior.append(amount)
        m_prior.append(amount)
        merchant_recent_txns[norm_merchant].append(
            {"dt": row_dt, "amt": amount, "id": txn_id}
        )
        day_category_txns[(when, category)].append(
            {"id": txn_id, "amount": amount}
        )

    # --- rule 5: high-frequency spend velocity surge in discretionary categories
    for (day_val, cat_val), txns in day_category_txns.items():
        if cat_val in _DISCRETIONARY_CATEGORIES and len(txns) >= _VELOCITY_DAILY_MIN_TXNS:
            day_total = sum(t["amount"] for t in txns)
            day_ids = [t["id"] for t in txns if t["id"]]
            facts.append(
                Fact(
                    text=(
                        f"High spending velocity detected: {len(txns)} separate transactions in "
                        f"{cat_val} on {day_val.isoformat()} totaling ₹{day_total:,.0f}."
                    ),
                    value=day_total,
                    source_txn_ids=day_ids,
                )
            )

    return facts
