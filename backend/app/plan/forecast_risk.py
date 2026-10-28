"""Forecast & Risk report: probabilistic cash-flow forecast, shortfall risk, scenario comparison, backtest.

Pure engine (no database): callers hand in monthly flows, transactions, starting cash and debts. The Monte Carlo
forecaster, planner cash arithmetic and backtest are the ones in app.plan; this module wires them into one report.
All numbers are computed; no LLM is used, so a seed fully determines the output.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel

from app.plan.accuracy import AccuracyReport, evaluate as evaluate_accuracy
from app.plan.risk import RiskAnalysis, analyze as analyze_risk
from app.plan.compare import ScenarioComparison, ScenarioParams, compare
from app.plan.forecast import (
    N_PATHS,
    SEED,
    choose_window,
    fit_forecaster,
    forecast_paths,
    make_split,
    method_block,
    month_labels,
)
from app.plan.planner import DebtIn, PlanInputs, _status_quo_mins
from app.plan.scenarios import DEBTS as SYNTH_DEBTS
from app.plan.schemas import Band, Constraints, ForecastMethod, Goal
from app.plan.synthetic import generate_monthly_history

MIN_MONTHS = 4
HORIZONS = (3, 6, 12)
SYNTH_MONTHS = 48
SYNTH_CASH = 70_000.0
PROFILES: dict[str, dict] = {
    "stable": dict(base_income=80_000.0, income_cv=0.05, zero_bonus_prob=0.0, disc_cv=0.12, unexpected_prob=0.02),
    "moderate": dict(base_income=78_000.0, income_cv=0.15, zero_bonus_prob=0.05, disc_cv=0.22, unexpected_prob=0.06),
    "volatile": dict(base_income=78_000.0, income_cv=0.30, zero_bonus_prob=0.12, disc_cv=0.32, unexpected_prob=0.12),
}


class DataSource(BaseModel):
    kind: Literal["real", "synthetic"]
    label: str
    disclosure: str
    months_available: int
    history_start: str | None = None
    history_end: str | None = None
    details: dict = {}


@dataclass
class Dataset:
    flows: pd.DataFrame
    txns: pd.DataFrame | None
    cash0: float
    debts: list[DebtIn]
    source: DataSource
    default_reserve: float | None = None
    notes: list[str] = field(default_factory=list)


class Params(BaseModel):
    horizon: int = 6
    sims: int = N_PATHS
    seed: int = SEED
    reserve: float | None = None
    tolerance: float = 0.10
    cut: float = 0.20
    savings: float | None = None
    extra_debt: float | None = None
    goal_amount: float | None = None
    goal_month: int | None = None


class PeriodView(BaseModel):
    period: int
    month: str
    income: Band
    expenses: Band  # essential + discretionary
    net: Band  # income - expenses - debt minimums
    cash: Band  # current-spending balance
    p_below_reserve: float
    p_negative: float


class HistoryPoint(BaseModel):
    month: str
    income: float
    expenses: float


class Summary(BaseModel):
    end_cash: Band
    median_income: float
    median_expenses: float
    median_net: float
    p_below_reserve: float
    p_negative: float
    risk_level: Literal["low", "moderate", "high"]


class ForecastRiskReport(BaseModel):
    status: Literal["ok", "insufficient_history"]
    message: str | None = None
    data_source: DataSource
    params: Params | None = None
    method: ForecastMethod | None = None
    starting_cash: float = 0.0
    reserve: float = 0.0
    summary: Summary | None = None
    history: list[HistoryPoint] = []
    periods: list[PeriodView] = []
    risk: RiskAnalysis | None = None
    scenarios: ScenarioComparison | None = None
    accuracy: AccuracyReport | None = None
    assumptions: list[str] = []
    warnings: list[str] = []


@lru_cache(maxsize=32)
def synthetic_dataset(profile: str, seed: int) -> Dataset:
    kw = PROFILES[profile]
    df, txns, assumptions = generate_monthly_history(seed=seed, test_seed=seed + 1000, months=SYNTH_MONTHS, **kw)
    src = DataSource(
        kind="synthetic", label=f"Synthetic history ({profile} income)",
        disclosure=("SYNTHETIC DATA: this history is generated from a seeded random model, not from your accounts. "
                    "Use it to explore how the forecast behaves; its results say nothing about your own finances."),
        months_available=len(df), history_start=df["month"].iloc[0], history_end=df["month"].iloc[-1],
        details={"profile": profile, "seed": seed, **assumptions},
    )
    return Dataset(
        flows=df, txns=txns, cash0=SYNTH_CASH, debts=list(SYNTH_DEBTS), source=src,
        notes=[f"Starting cash INR {SYNTH_CASH:,.0f} and two loans (INR 2.5L at 18%, INR 4L at 11%) are assumed for the synthetic profile."],
    )


def real_source(flows: pd.DataFrame, extra: str = "") -> DataSource:
    n = len(flows)
    return DataSource(
        kind="real", label="Your transactions", months_available=n,
        history_start=flows["month"].iloc[0] if n else None, history_end=flows["month"].iloc[-1] if n else None,
        disclosure="Computed from your connected transaction history (complete calendar months only)." + extra,
    )


def _insufficient(ds: Dataset) -> ForecastRiskReport:
    n = len(ds.flows)
    return ForecastRiskReport(
        status="insufficient_history", data_source=ds.source,
        message=(f"Need at least {MIN_MONTHS} complete months of transactions to forecast; found {n}. "
                 "Connect more history, or switch to the synthetic data to explore the feature."),
    )


def _bands(a: np.ndarray) -> Band:
    p10, p50, p90 = np.percentile(a, [10, 50, 90])
    return Band(p10=round(float(p10), 2), p50=round(float(p50), 2), p90=round(float(p90), 2))


def _round100(x: float) -> float:
    return float(max(0.0, round(x / 100.0) * 100.0))


def build_report(ds: Dataset, p: Params) -> ForecastRiskReport:
    flows = ds.flows
    n = len(flows)
    if n < MIN_MONTHS:
        return _insufficient(ds)
    h = p.horizon
    window = choose_window(flows, make_split(n))
    paths = forecast_paths(fit_forecaster(flows, window), h, n=p.sims, seed=p.seed)
    labels = month_labels(str(pd.Period(flows["month"].iloc[-1]) + 1), h)
    reserve = p.reserve if p.reserve is not None else (
        ds.default_reserve if ds.default_reserve is not None else float(flows["essential"].tail(window).median()))
    goal = Goal(amount=p.goal_amount, by_period=p.goal_month) if p.goal_amount and p.goal_month else None
    method = method_block(window, h, p.sims, p.seed)

    mins, _ = _status_quo_mins(ds.debts, h)
    inc_cv = float(flows["income"].std(ddof=1) / flows["income"].mean()) if n > 1 and flows["income"].mean() > 0 else None
    analysis = analyze_risk(paths, ds.cash0, reserve, mins, labels, p.tolerance, inc_cv)

    med_income = float(np.median(paths[:, :, 0], axis=0).mean())
    default_amt = _round100(0.10 * med_income)
    sp = ScenarioParams(
        cut=p.cut, savings=_round100(p.savings) if p.savings is not None else default_amt,
        extra_debt=_round100(p.extra_debt) if p.extra_debt is not None else default_amt,
    )
    inp = PlanInputs(
        paths=paths, method=method, cash0=ds.cash0, debts=ds.debts, start_month=labels[0], horizon=h,
        constraints=Constraints(min_reserve=reserve, goal=goal, risk_tolerance=p.tolerance, policy_cut=p.cut),
    )
    scen = compare(inp, sp, labels)
    current = scen.outcomes[0]

    exp = paths[:, :, 1] + paths[:, :, 2]
    net = paths[:, :, 0] - exp - np.asarray(mins)
    periods = [
        PeriodView(
            period=t + 1, month=labels[t], income=_bands(paths[:, t, 0]), expenses=_bands(exp[:, t]), net=_bands(net[:, t]),
            cash=current.cash[t], p_below_reserve=analysis.by_month[t].p_below_reserve, p_negative=analysis.by_month[t].p_negative,
        )
        for t in range(h)
    ]
    tail = flows.tail(12)
    history = [HistoryPoint(month=r.month, income=round(float(r.income), 2), expenses=round(float(r.essential + r.discretionary), 2))
               for r in tail.itertuples()]
    summary = Summary(
        end_cash=current.end_cash, median_income=round(med_income, 2),
        median_expenses=round(float(np.median(exp, axis=0).mean()), 2), median_net=round(float(np.median(net, axis=0).mean()), 2),
        p_below_reserve=analysis.p_below_reserve, p_negative=analysis.p_negative, risk_level=analysis.level,
    )
    acc = evaluate_accuracy(flows, ds.txns)

    warnings = list(ds.notes)
    if n < 12:
        warnings.append(f"Only {n} months of history: intervals rest on very few observations and are likely too narrow.")
    if not ds.debts:
        warnings.append("No debts on record, so the extra-debt-repayment scenario is unavailable.")
    if ds.source.kind == "real" and p.reserve is None:
        warnings.append(f"Reserve defaults to your median monthly essential spend (INR {reserve:,.0f}); set your own for a truer risk reading.")
    return ForecastRiskReport(
        status="ok", data_source=ds.source, params=p, method=method, starting_cash=round(ds.cash0, 2), reserve=round(reserve, 2),
        summary=summary, history=history, periods=periods, risk=analysis, scenarios=scen, accuracy=acc,
        assumptions=_assumptions(method, window, p, ds, reserve), warnings=warnings,
    )


def _assumptions(m: ForecastMethod, window: int, p: Params, ds: Dataset, reserve: float) -> list[str]:
    return [
        f"Monte Carlo: {m.n_paths:,} simulated {m.horizon_months}-month paths, seed {m.seed} (same inputs and seed give identical results).",
        m.description,
        f"Window: the median of the last {window} months is the central forecast; the window is chosen on a validation block, not on the test months.",
        "Income, essential spending and discretionary spending are resampled together month by month, which keeps their correlation.",
        "No trend or seasonality is modelled; the forecast is a flat median with realistic spread. Large one-off events (job loss, medical) appear only if they occurred in your history.",
        "Debt interest accrues monthly at APR/12; minimum payments are always made; transfers, card-bill payments and EMIs are excluded from spending (EMIs are covered through debt minimums).",
        f"Shortfall means the month-end balance is below the reserve (INR {reserve:,.0f}) in any month of the horizon; 'below zero' uses a reserve of 0.",
        f"Scenarios replay the same simulated paths: discretionary cut {p.cut * 100:.0f}%, with extra savings and extra debt repayment as fixed monthly amounts.",
        f"Starting cash: INR {ds.cash0:,.0f}.",
        "Accuracy: chronological split; every forecast origin is fitted only on earlier months. 80% interval = P10 to P90.",
    ]
