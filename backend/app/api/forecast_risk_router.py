"""Forecast & Risk: probabilistic cash-flow forecast, shortfall risk, scenario comparison and backtest.

Mounted in app.main with prefix="/api". `source=real` uses the user's own transactions; `source=synthetic`
uses a seeded, clearly-labelled generated history and needs no data.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.routes import _starting_balance_for_user
from app.core import store
from app.core.auth import resolve_user_id
from app.ingest.personas import PLAN_PROFILES
from app.ingest.snapshot import _transactions_df
from app.models import ConnectionRow, DebtRow, TransactionRow
from app.plan.forecast import SEED
from app.plan.forecast_risk import (
    HORIZONS,
    PROFILES,
    Dataset,
    ForecastRiskReport,
    Params,
    build_report,
    real_source,
    synthetic_dataset,
)
from app.plan.history import monthly_flows
from app.plan.planner import DebtIn

router = APIRouter()


def _real_dataset(user_id: str) -> tuple[Dataset, dict]:
    df = _transactions_df(store.query(TransactionRow, user_id=user_id))
    flows = monthly_flows(df) if not df.empty else pd.DataFrame(columns=["month", "income", "essential", "discretionary"])
    # Connected sandbox users inherit the declared reserve/goal of the persona they linked (same rule as /plan).
    link = store.get(ConnectionRow, f"{user_id}:google_pay")
    profile = PLAN_PROFILES.get(f"demo-{link.detail.lower()}" if link and link.detail else user_id, {})
    ds = Dataset(
        flows=flows, txns=df if not df.empty else None, cash0=_starting_balance_for_user(user_id),
        debts=[DebtIn(d.principal, d.interest_rate_apr, d.minimum_payment) for d in store.query(DebtRow, user_id=user_id)],
        source=real_source(flows), default_reserve=profile.get("reserve"),
    )
    return ds, profile


@router.get("/forecast-risk/{user_id}", response_model=ForecastRiskReport)
def get_forecast_risk(
    source: Literal["real", "synthetic"] = Query("real"),
    horizon: int = Query(6),
    sims: int = Query(2000, ge=500, le=10000),
    seed: int = Query(SEED, ge=0, le=2**32 - 1),
    reserve: float | None = Query(None, ge=0, allow_inf_nan=False),
    tolerance: float = Query(0.10, ge=0, le=1, allow_inf_nan=False),
    cut: float = Query(0.20, ge=0, le=0.30, allow_inf_nan=False),
    savings: float | None = Query(None, ge=0, allow_inf_nan=False),
    extra_debt: float | None = Query(None, ge=0, allow_inf_nan=False),
    goal_amount: float | None = Query(None, gt=0, allow_inf_nan=False),
    goal_month: int | None = Query(None, ge=1),
    profile: str = Query("moderate"),
    synth_seed: int = Query(7, ge=0, le=2**32 - 1),
    user_id: str = Depends(resolve_user_id),
) -> ForecastRiskReport:
    if horizon not in HORIZONS:
        raise HTTPException(422, f"horizon must be one of {list(HORIZONS)}")
    if (goal_amount is None) != (goal_month is None):
        raise HTTPException(422, "goal_amount and goal_month must be given together")
    if goal_month is not None and goal_month > horizon:
        raise HTTPException(422, "goal_month must be within the horizon")

    if source == "synthetic":
        if profile not in PROFILES:
            raise HTTPException(422, f"profile must be one of {list(PROFILES)}")
        ds, defaults = synthetic_dataset(profile, synth_seed), {}
    else:
        ds, defaults = _real_dataset(user_id)

    if reserve is None and goal_amount is None and goal_month is None and defaults.get("goal_month", 99) <= horizon:
        goal_amount, goal_month = defaults.get("goal_amount"), defaults.get("goal_month")
    return build_report(ds, Params(
        horizon=horizon, sims=sims, seed=seed, reserve=reserve, tolerance=tolerance, cut=cut, savings=savings,
        extra_debt=extra_debt, goal_amount=goal_amount, goal_month=goal_month,
    ))
