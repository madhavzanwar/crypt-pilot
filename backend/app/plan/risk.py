"""Cash-shortfall risk on simulated cash paths.

Everything here is a deterministic function of the simulated income / essential /
discretionary paths, so the same seed always gives the same numbers. No LLM is involved;
the explanatory sentences are templated from the computed values.
"""
from __future__ import annotations

from typing import Literal

import numpy as np
from pydantic import BaseModel

_EPS = 1e-6
_STREAMS = (("income", "Income variability"), ("essential", "Essential-expense variability"),
            ("discretionary", "Discretionary-spend variability"))


class MonthRisk(BaseModel):
    period: int
    month: str
    p_below_reserve: float  # P(cash < reserve at the end of this month)
    p_negative: float  # P(cash < 0 at the end of this month)
    p_first_breach: float  # P(this is the first month cash drops below reserve)


class Severity(BaseModel):
    expected_shortfall: float  # mean over ALL paths of how far the lowest balance sits under the reserve
    median_if_breach: float  # median shortfall among paths that do breach
    p95_if_breach: float  # 1-in-20 bad case among breaching paths
    p95_below_zero: float  # 95th pct overdraft among paths that go below 0 (0 if none do)


class RiskFactor(BaseModel):
    key: str
    label: str
    message: str
    impact: float | None = None  # drop in shortfall probability if this source of uncertainty is removed


class RiskAnalysis(BaseModel):
    reserve: float
    tolerance: float
    p_below_reserve: float  # P(cash < reserve in ANY month of the horizon)
    p_negative: float  # P(cash < 0 in ANY month)
    level: Literal["low", "moderate", "high"]
    typical_breach_month: str | None  # median first-breach month among breaching paths
    by_month: list[MonthRisk]
    severity: Severity
    factors: list[RiskFactor]


def cash_paths(paths: np.ndarray, cash0: float, debt_mins: np.ndarray) -> np.ndarray:
    """(n, h) end-of-month balance with no behaviour change: cash0 + cumulative (income - expenses - debt minimums)."""
    h = len(debt_mins)
    net = paths[:, :h, 0] - paths[:, :h, 1] - paths[:, :h, 2] - debt_mins
    return cash0 + np.cumsum(net, axis=1)


def _p_breach(cash: np.ndarray, reserve: float) -> float:
    return float((cash < reserve - _EPS).any(axis=1).mean())


def level_for(p: float, tolerance: float) -> Literal["low", "moderate", "high"]:
    if p <= tolerance:
        return "low"
    return "moderate" if p <= max(2 * tolerance, 0.25) else "high"


def _pts(x: float) -> str:
    return f"{x * 100:.0f}"


def _inr(x: float) -> str:
    return f"INR {x:,.0f}"


def analyze(
    paths: np.ndarray,
    cash0: float,
    reserve: float,
    debt_mins: list[float],
    labels: list[str],
    tolerance: float,
    income_cv: float | None = None,
) -> RiskAnalysis:
    mins = np.asarray(debt_mins, dtype=float)
    h = len(mins)
    cash = cash_paths(paths, cash0, mins)
    below = cash < reserve - _EPS
    any_below = below.any(axis=1)
    p_any = float(any_below.mean())
    first = np.where(any_below, below.argmax(axis=1), -1)

    by_month = [
        MonthRisk(
            period=t + 1, month=labels[t], p_below_reserve=round(float(below[:, t].mean()), 4),
            p_negative=round(float((cash[:, t] < 0).mean()), 4),
            p_first_breach=round(float((first == t).mean()), 4),
        )
        for t in range(h)
    ]

    depth = np.clip(reserve - cash.min(axis=1), 0.0, None)
    overdraft = np.clip(-cash.min(axis=1), 0.0, None)
    hit, neg = depth[any_below], overdraft[overdraft > 0]
    severity = Severity(
        expected_shortfall=round(float(depth.mean()), 2),
        median_if_breach=round(float(np.median(hit)), 2) if len(hit) else 0.0,
        p95_if_breach=round(float(np.percentile(hit, 95)), 2) if len(hit) else 0.0,
        p95_below_zero=round(float(np.percentile(neg, 95)), 2) if len(neg) else 0.0,
    )
    typical = labels[int(np.median(first[any_below]))] if any_below.any() else None

    return RiskAnalysis(
        reserve=round(reserve, 2), tolerance=tolerance, p_below_reserve=round(p_any, 4),
        p_negative=round(float((cash < 0).any(axis=1).mean()), 4), level=level_for(p_any, tolerance),
        typical_breach_month=typical, by_month=by_month, severity=severity,
        factors=_factors(paths, cash0, reserve, mins, p_any, income_cv),
    )


def _factors(
    paths: np.ndarray, cash0: float, reserve: float, mins: np.ndarray, base: float, income_cv: float | None
) -> list[RiskFactor]:
    """Sensitivity attribution: freeze one stream at its per-month median across paths and re-measure the
    shortfall probability. The drop is how much of the risk that source of uncertainty drives. The drops need
    not add up to the total because the streams interact."""
    h = len(mins)
    out: list[RiskFactor] = []
    for i, (key, label) in enumerate(_STREAMS):
        frozen = paths[:, :h, :].copy()
        frozen[:, :, i] = np.median(frozen[:, :, i], axis=0, keepdims=True)
        p = _p_breach(cash_paths(frozen, cash0, mins), reserve)
        drop = base - p
        out.append(RiskFactor(
            key=key, label=label, impact=round(drop, 4),
            message=(
                f"Fixing {key} at its monthly median changes shortfall probability by less than 1 pt "
                f"({_pts(base)}% to {_pts(p)}%)."
                if abs(drop) < 0.005 else
                f"If {key} were fixed at its monthly median, shortfall probability would go from "
                f"{_pts(base)}% to {_pts(p)}% ({'-' if drop >= 0 else '+'}{_pts(abs(drop))} pts)."
            ),
        ))
    out.sort(key=lambda f: -(f.impact or 0.0))

    med = np.median(paths[:, :h, :], axis=0)
    net = med[:, 0] - med[:, 1] - med[:, 2] - mins
    avg_net, cushion = float(net.mean()), cash0 - reserve
    out.append(RiskFactor(
        key="median_net", label="Typical monthly surplus" if avg_net >= 0 else "Spending above income",
        message=(f"In the median case you keep {_inr(avg_net)} a month after expenses and debt minimums."
                 if avg_net >= 0 else
                 f"In the median case you spend {_inr(-avg_net)} a month more than you earn after debt minimums, "
                 f"so the balance drifts down even without bad luck."),
    ))
    burn = -avg_net
    out.append(RiskFactor(
        key="cushion", label="Starting cushion",
        message=(f"You start {_inr(cushion)} above the {_inr(reserve)} reserve"
                 + (f", about {cushion / burn:.1f} months of the median shortfall." if burn > 0 else ".")
                 if cushion >= 0 else
                 f"You start {_inr(-cushion)} below the {_inr(reserve)} reserve, so risk exists from month 1."),
    ))
    inc, mn = float(med[:, 0].mean()), float(mins.mean())
    if mn > 0 and inc > 0:
        out.append(RiskFactor(
            key="debt_load", label="Debt payments",
            message=f"Debt minimums take {mn / inc * 100:.0f}% of median monthly income ({_inr(mn)} a month).",
        ))
    if income_cv is not None:
        out.append(RiskFactor(
            key="income_cv", label="Income stability",
            message=f"Monthly income in your history varies by {income_cv * 100:.0f}% around its average "
                    f"({'steady' if income_cv < 0.1 else 'noticeable' if income_cv < 0.25 else 'high'} variability).",
        ))
    return out
