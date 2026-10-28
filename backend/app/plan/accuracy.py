"""Historical backtest of the probabilistic model against two baselines, plus risk calibration.

No leakage: every forecast origin refits on months strictly before it, the averaging window is chosen on a
validation block that sits before the test block, and the test months are only used for scoring. Point and
interval accuracy reuse app.plan.forecast.backtest (bootstrap vs historical-average vs recurring-payment);
this module adds the split guard, a calibration check of the shortfall probabilities, and plain-language findings.
"""
from __future__ import annotations

from statistics import NormalDist

import numpy as np
import pandas as pd
from pydantic import BaseModel

from app.plan.forecast import (
    RESID_CAP,
    SEED,
    _x,
    backtest,
    choose_window,
    fit_forecaster,
    forecast_paths,
    make_split,
    timeline,
)
from app.plan.schemas import BacktestRow, Timeline

MIN_MONTHS = 12  # 6 train + 3 validation + 3 test with make_split
CAL_STEPS = 3
CAL_PATHS = 1000
_NORM = NormalDist()


class CalibrationBin(BaseModel):
    lo: float
    hi: float
    mean_predicted: float
    observed: float
    count: int


class RiskCalibration(BaseModel):
    event: str
    n_forecasts: int
    mean_predicted: float
    observed_rate: float
    brier_model: float  # lower is better
    brier_hist_avg: float
    bins: list[CalibrationBin]
    low_sample: bool


class AccuracyReport(BaseModel):
    available: bool
    reason: str | None = None
    n_test_months: int = 0
    timeline: Timeline | None = None
    rows: list[BacktestRow] = []
    calibration: RiskCalibration | None = None
    findings: list[str] = []


def unavailable(reason: str) -> AccuracyReport:
    return AccuracyReport(available=False, reason=reason)


def evaluate(flows: pd.DataFrame, txns: pd.DataFrame | None) -> AccuracyReport:
    n = len(flows)
    if n < MIN_MONTHS:
        return unavailable(f"Backtesting needs at least {MIN_MONTHS} complete months of history; found {n}.")
    split = make_split(n)
    window = choose_window(flows, split)
    note = None
    try:
        rows = backtest(flows, split, window, txns)
    except Exception:  # recurring baseline needs well-formed transactions; fall back to the two other models
        rows = backtest(flows, split, window, None)
        note = "Recurring-payment baseline skipped: transactions could not be grouped into recurring series."
    cal = _calibration(flows, split, window)
    rep = AccuracyReport(
        available=True, n_test_months=split.total - split.val_end, timeline=timeline(split, window),
        rows=rows, calibration=cal,
    )
    rep.findings = _findings(rep) + ([note] if note else [])
    return rep


def _calibration(df: pd.DataFrame, split, window: int) -> RiskCalibration:
    """Reliability of P(cumulative net cash flow over the next 1-3 months < 0), i.e. spending outruns income.
    Compared with a normal approximation fitted to the same history (the historical-average baseline)."""
    p_model, p_hist, actual = [], [], []
    for o in range(split.val_end + 1, split.total + 1):
        hist = df.loc[: o - 1]
        steps = min(CAL_STEPS, split.total - o + 1)
        paths = forecast_paths(fit_forecaster(hist, window), steps, n=CAL_PATHS, seed=SEED + o)
        cum = np.cumsum(paths[:, :, 0] - paths[:, :, 1] - paths[:, :, 2], axis=1)
        act = _x(df.loc[o : o + steps - 1])
        act_cum = np.cumsum(act[:, 0] - act[:, 1] - act[:, 2])
        x = _x(hist)[-RESID_CAP:]
        net = x[:, 0] - x[:, 1] - x[:, 2]
        mu, sd = float(net.mean()), float(net.std(ddof=1)) if len(net) > 1 else 0.0
        for j in range(steps):
            p_model.append(float((cum[:, j] < 0).mean()))
            s = sd * np.sqrt(j + 1)
            p_hist.append(_NORM.cdf(-mu * (j + 1) / s) if s > 0 else float(mu * (j + 1) < 0))
            actual.append(float(act_cum[j] < 0))
    pm, ph, a = np.array(p_model), np.array(p_hist), np.array(actual)
    bins = []
    for lo, hi in ((0.0, 0.2), (0.2, 0.5), (0.5, 1.0001)):
        m = (pm >= lo) & (pm < hi)
        if m.any():
            bins.append(CalibrationBin(
                lo=lo, hi=min(hi, 1.0), mean_predicted=round(float(pm[m].mean()), 3),
                observed=round(float(a[m].mean()), 3), count=int(m.sum()),
            ))
    return RiskCalibration(
        event="Spending exceeds income over the next 1, 2 or 3 months (cumulative net cash flow below zero)",
        n_forecasts=len(a), mean_predicted=round(float(pm.mean()), 3), observed_rate=round(float(a.mean()), 3),
        brier_model=round(float(((pm - a) ** 2).mean()), 4), brier_hist_avg=round(float(((ph - a) ** 2).mean()), 4),
        bins=bins, low_sample=len(a) < 30,
    )


def _findings(r: AccuracyReport) -> list[str]:
    by = {(x.model, x.stream): x for x in r.rows}
    out: list[str] = []
    m, h = by.get(("bootstrap", "net")), by.get(("hist_avg", "net"))
    if m and h and h.mae > 0:
        d = (h.mae - m.mae) / h.mae * 100
        out.append(f"Net cash-flow error (MAE) is {abs(d):.0f}% {'lower' if d >= 0 else 'higher'} than the historical-average baseline.")
    rc = by.get(("recurring", "net"))
    if m and rc and rc.mae > 0:
        d = (rc.mae - m.mae) / rc.mae * 100
        out.append(f"It is {abs(d):.0f}% {'lower' if d >= 0 else 'higher'} than the recurring-payment baseline, which ignores everyday spending.")
    if m:
        gap = m.coverage - 0.8
        verdict = "close to the 80% target" if abs(gap) <= 0.1 else ("wider than needed" if gap > 0 else "too narrow (overconfident)")
        out.append(f"The 80% interval contained {m.coverage * 100:.0f}% of actual net cash flows: {verdict}.")
    c = r.calibration
    if c:
        out.append(
            f"Shortfall probabilities averaged {c.mean_predicted * 100:.0f}% against an observed rate of {c.observed_rate * 100:.0f}% "
            f"(Brier {c.brier_model:.3f} vs {c.brier_hist_avg:.3f} for the historical-average baseline; lower is better)."
        )
        if c.low_sample:
            out.append(f"Only {c.n_forecasts} test forecasts, so calibration is indicative, not conclusive.")
    return out
