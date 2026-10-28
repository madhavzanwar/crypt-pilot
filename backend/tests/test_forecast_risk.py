"""Tests for the Forecast & Risk engine (app.plan.risk / compare / accuracy / forecast_risk).

Pure (no DB) except the HTTP checks, which use only the synthetic source.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.plan import accuracy, risk
from app.plan.compare import ScenarioParams, compare
from app.plan.forecast import make_split
from app.plan.forecast import choose_window
from app.plan.forecast_risk import Dataset, Params, build_report, real_source, synthetic_dataset
from app.plan.planner import DebtIn, PlanInputs
from app.plan.schemas import Constraints, ForecastMethod, Goal
from app.plan.synthetic import generate_monthly_history

LABELS = ["2030-01", "2030-02", "2030-03", "2030-04"]


def _paths(income, essential, disc, n=50):
    h = len(income)
    p = np.zeros((n, h, 3))
    p[:, :, 0], p[:, :, 1], p[:, :, 2] = income, essential, disc
    return p


# ---------------------------------------------------------------- risk

def test_risk_hand_computed_deterministic_drain():
    # net = 100 - 80 - 30 = -10 a month from 25 cash: balances 15, 5, -5, -15
    a = risk.analyze(_paths([100] * 4, [80] * 4, [30] * 4), cash0=25, reserve=0, debt_mins=[0] * 4, labels=LABELS, tolerance=0.1)
    assert a.p_below_reserve == 1.0 and a.p_negative == 1.0
    assert a.typical_breach_month == "2030-03"
    assert [m.p_below_reserve for m in a.by_month] == [0.0, 0.0, 1.0, 1.0]
    assert [m.p_first_breach for m in a.by_month] == [0.0, 0.0, 1.0, 0.0]
    assert a.severity.expected_shortfall == 15.0 and a.severity.p95_below_zero == 15.0
    assert a.level == "high"


def test_risk_reserve_raises_probability_and_none_when_safe():
    rng = np.random.default_rng(0)
    p = _paths([100] * 4, [50] * 4, [20] * 4, n=400)
    p[:, :, 0] += rng.normal(0, 15, size=(400, 4))
    probs = [risk.analyze(p, 60, r, [0] * 4, LABELS, 0.1).p_below_reserve for r in (0, 40, 80, 120)]
    assert probs == sorted(probs) and probs[-1] > probs[0]
    safe = risk.analyze(_paths([100] * 4, [10] * 4, [10] * 4), 500, 0, [0] * 4, LABELS, 0.1)
    assert safe.p_below_reserve == 0 and safe.typical_breach_month is None and safe.level == "low"
    assert safe.severity.expected_shortfall == 0 and safe.severity.p95_if_breach == 0


def test_risk_levels_follow_tolerance():
    assert risk.level_for(0.05, 0.10) == "low"
    assert risk.level_for(0.20, 0.10) == "moderate"
    assert risk.level_for(0.60, 0.10) == "high"


def test_risk_factor_attribution_points_at_the_noisy_stream():
    rng = np.random.default_rng(1)
    p = _paths([100] * 4, [60] * 4, [20] * 4, n=1000)
    p[:, :, 0] += rng.normal(0, 30, size=(1000, 4))  # only income varies
    a = risk.analyze(p, cash0=35, reserve=30, debt_mins=[0] * 4, labels=LABELS, tolerance=0.1)
    by = {f.key: f for f in a.factors}
    assert a.p_below_reserve > 0.2
    assert by["income"].impact > 0.2 and abs(by["essential"].impact) < 1e-9 and abs(by["discretionary"].impact) < 1e-9
    assert a.factors[0].key == "income"  # sorted by impact


# ---------------------------------------------------------------- compare

def _inp(paths, debts, goal=None, tol=0.1, cash0=100_000.0, reserve=0.0):
    h = paths.shape[1]
    return PlanInputs(
        paths=paths, cash0=cash0, debts=debts, start_month=LABELS[0], horizon=h,
        method=ForecastMethod(name="t", horizon_months=h, n_paths=len(paths), seed=0, window_months=3, pi_level=0.8, description=""),
        constraints=Constraints(min_reserve=reserve, goal=goal, risk_tolerance=tol),
    )


def test_compare_arithmetic_and_default_ordering():
    p = _paths([100_000] * 4, [40_000] * 4, [20_000] * 4)
    sc = compare(_inp(p, [DebtIn(100_000, 12.0, 3_000)]), ScenarioParams(cut=0.25, savings=5_000, extra_debt=4_000), LABELS)
    o = {x.id: x for x in sc.outcomes}
    assert list(o) == ["current", "cut_discretionary", "increase_savings", "extra_debt"]
    assert o["cut_discretionary"].spending_avoided == 0.25 * 20_000 * 4
    assert o["increase_savings"].total_savings == 5_000 * 4
    assert o["extra_debt"].total_extra_debt == 4_000 * 4
    assert o["extra_debt"].debt_change < 0 and o["extra_debt"].interest_saved > 0
    assert o["cut_discretionary"].net_worth_change == 5_000 * 4  # cash kept = spending avoided
    assert o["increase_savings"].net_worth_change == 0  # moving cash to savings is net-worth neutral
    assert o["current"].risk_delta == 0 and o["current"].value_built == 0


def test_compare_extra_debt_unavailable_without_debt_and_never_recommended():
    p = _paths([100_000] * 4, [40_000] * 4, [20_000] * 4)
    sc = compare(_inp(p, []), ScenarioParams(cut=0.2, savings=5_000, extra_debt=5_000), LABELS)
    d = next(x for x in sc.outcomes if x.id == "extra_debt")
    assert not d.available and "No debts" in (d.unavailable_reason or "")
    assert sc.recommendation and sc.recommendation.scenario_id != "extra_debt"


def test_compare_recommendation_respects_tolerance_and_goal():
    # tight cash: moving 30k a month to savings pushes the balance below reserve; a spending cut does not
    p = _paths([60_000] * 4, [30_000] * 4, [25_000] * 4)
    sc = compare(_inp(p, [DebtIn(50_000, 10.0, 2_000)], cash0=20_000, reserve=10_000), ScenarioParams(cut=0.3, savings=30_000, extra_debt=30_000), LABELS)
    o = {x.id: x for x in sc.outcomes}
    assert o["increase_savings"].shortfall_risk > 0.1 and o["extra_debt"].shortfall_risk > 0.1
    rec = sc.recommendation
    assert rec and rec.within_tolerance and rec.scenario_id in ("current", "cut_discretionary")
    assert next(x for x in sc.outcomes if x.id == rec.scenario_id).shortfall_risk <= 0.1
    # a goal that only the savings scenario can meet, with plenty of room: it is chosen
    rich = compare(_inp(_paths([100_000] * 4, [30_000] * 4, [20_000] * 4), [], goal=Goal(amount=40_000, by_period=4)),
                   ScenarioParams(cut=0.1, savings=10_000, extra_debt=0), LABELS)
    assert rich.recommendation.scenario_id == "increase_savings"


def test_compare_no_scenario_within_tolerance_picks_lowest_risk():
    p = _paths([40_000] * 4, [30_000] * 4, [20_000] * 4)  # loses 10k a month with only 5k cash
    sc = compare(_inp(p, [], cash0=5_000, reserve=0), ScenarioParams(cut=0.1, savings=1_000, extra_debt=0), LABELS)
    rec = sc.recommendation
    assert rec and not rec.within_tolerance
    assert sc.outcomes[[x.id for x in sc.outcomes].index(rec.scenario_id)].shortfall_risk == min(
        x.shortfall_risk for x in sc.outcomes if x.available)


# ---------------------------------------------------------------- report

def test_report_is_deterministic_and_seed_sensitive():
    ds = synthetic_dataset("moderate", 7)
    a = build_report(ds, Params(horizon=6, seed=11)).model_dump()
    assert a == build_report(ds, Params(horizon=6, seed=11)).model_dump()
    assert a["periods"] != build_report(ds, Params(horizon=6, seed=12)).model_dump()["periods"]


def test_report_horizons_share_a_prefix_and_report_simulation_count():
    ds = synthetic_dataset("moderate", 7)
    r3, r12 = (build_report(ds, Params(horizon=h, sims=1500)) for h in (3, 12))
    assert len(r3.periods) == 3 and len(r12.periods) == 12
    assert r3.periods[:3] == r12.periods[:3]
    assert r3.method.n_paths == 1500 and r3.method.seed == Params().seed
    assert any("1,500" in s for s in r3.assumptions)


def test_prediction_bands_are_ordered_and_probabilities_valid():
    r = build_report(synthetic_dataset("volatile", 7), Params(horizon=12))
    for p in r.periods:
        for b in (p.income, p.expenses, p.net, p.cash):
            assert b.p10 <= b.p50 <= b.p90
        assert 0 <= p.p_negative <= p.p_below_reserve <= 1
    assert 0 <= r.risk.p_negative <= r.risk.p_below_reserve <= 1
    assert r.risk.p_below_reserve >= max(m.p_below_reserve for m in r.risk.by_month)
    assert abs(sum(m.p_first_breach for m in r.risk.by_month) - r.risk.p_below_reserve) < 1e-9


def test_synthetic_profiles_order_risk_and_are_labelled():
    risks = {k: build_report(synthetic_dataset(k, 7), Params()).risk.p_below_reserve for k in ("stable", "moderate", "volatile")}
    assert risks["stable"] < risks["moderate"] < risks["volatile"]
    src = build_report(synthetic_dataset("stable", 7), Params()).data_source
    assert src.kind == "synthetic" and "SYNTHETIC" in src.disclosure and src.details["seed"] == 7


def test_unexpected_costs_are_opt_in_and_default_history_is_unchanged():
    base, _, _ = generate_monthly_history()
    same, _, _ = generate_monthly_history(unexpected_prob=0.0)
    spiky, _, a = generate_monthly_history(unexpected_prob=0.5)
    assert base.equals(same)
    assert spiky["essential"].mean() > base["essential"].mean() + 3_000 and "50%" in a["unexpected_costs"]


def test_insufficient_and_short_history_degrade_gracefully():
    ds = synthetic_dataset("moderate", 7)
    tiny = Dataset(flows=ds.flows.head(3), txns=None, cash0=1_000, debts=[], source=real_source(ds.flows.head(3)))
    r = build_report(tiny, Params())
    assert r.status == "insufficient_history" and "at least 4" in r.message and r.periods == [] and r.risk is None
    empty = Dataset(flows=pd.DataFrame(columns=["month", "income", "essential", "discretionary"]), txns=None, cash0=0, debts=[],
                    source=real_source(pd.DataFrame(columns=["month"])))
    assert build_report(empty, Params()).status == "insufficient_history"
    short = Dataset(flows=ds.flows.head(6).reset_index(drop=True).set_axis(range(1, 7)), txns=None, cash0=50_000, debts=[],
                    source=real_source(ds.flows.head(6)))
    r = build_report(short, Params(horizon=3))
    assert r.status == "ok" and not r.accuracy.available and "at least 12" in r.accuracy.reason
    assert any("Only 6 months" in w for w in r.warnings) and any("No debts" in w for w in r.warnings)


def test_zero_income_history_does_not_crash():
    flows = pd.DataFrame({"month": [f"2024-{m:02d}" for m in range(1, 9)], "income": 0.0, "essential": 1_000.0, "discretionary": 500.0})
    flows.index = range(1, 9)
    r = build_report(Dataset(flows=flows, txns=None, cash0=2_000, debts=[], source=real_source(flows)), Params(horizon=3))
    assert r.status == "ok" and r.risk.p_below_reserve == 1.0


# ---------------------------------------------------------------- accuracy

def test_accuracy_metrics_and_calibration_are_well_formed():
    r = build_report(synthetic_dataset("volatile", 7), Params())
    a = r.accuracy
    assert a.available and a.n_test_months == a.timeline.test[1] - a.timeline.test[0] + 1
    models = {(x.model, x.stream) for x in a.rows}
    assert {("bootstrap", "net"), ("hist_avg", "net"), ("recurring", "net")} <= models
    for x in a.rows:
        assert x.mae >= 0 and 0 <= x.coverage <= 1 and x.mean_width >= 0
    c = a.calibration
    assert c.n_forecasts > 0 and 0 <= c.brier_model <= 1 and 0 <= c.brier_hist_avg <= 1
    assert sum(b.count for b in c.bins) == c.n_forecasts
    assert a.findings and any("MAE" in f for f in a.findings)


def test_backtest_does_not_leak_test_months_into_model_choice():
    df, txns, _ = generate_monthly_history(seed=3, test_seed=1003, months=48)
    split = make_split(len(df))
    scrambled = df.copy()
    scrambled.loc[split.val_end + 1 :, ["income", "essential", "discretionary"]] = 1e9  # garbage in the held-out block
    assert choose_window(df, split) == choose_window(scrambled, split)
    assert accuracy.evaluate(df, txns).timeline.chosen_window == accuracy.evaluate(scrambled, txns).timeline.chosen_window


def test_accuracy_unavailable_below_minimum_history():
    df, txns, _ = generate_monthly_history(months=36)
    r = accuracy.evaluate(df.head(accuracy.MIN_MONTHS - 1), txns)
    assert not r.available and r.rows == [] and r.calibration is None


# ---------------------------------------------------------------- HTTP (synthetic source only)

client = TestClient(app)


def test_endpoint_synthetic_contract_and_validation():
    r = client.get("/api/forecast-risk/demo-priya", params={"source": "synthetic", "horizon": 6, "profile": "volatile", "sims": 800})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["data_source"]["kind"] == "synthetic" and j["method"]["n_paths"] == 800
    assert len(j["periods"]) == 6 and len(j["scenarios"]["outcomes"]) == 4 and j["accuracy"]["available"]
    assert client.get("/api/forecast-risk/demo-priya", params={"source": "synthetic", "horizon": 5}).status_code == 422
    assert client.get("/api/forecast-risk/demo-priya", params={"source": "synthetic", "profile": "nope"}).status_code == 422
    assert client.get("/api/forecast-risk/demo-priya", params={"source": "synthetic", "goal_amount": 100}).status_code == 422
    assert client.get("/api/forecast-risk/demo-priya", params={"source": "synthetic", "horizon": 3, "goal_amount": 100, "goal_month": 6}).status_code == 422
