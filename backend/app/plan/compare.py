"""Four-way scenario comparison on a shared set of simulated paths.

Scenarios are fixed monthly schedules (discretionary cut, extra debt payment, extra savings) replayed over
the same Monte Carlo paths, so differences between them are policy effects, not simulation noise. Cash
arithmetic comes from the planner's DebtBook / _build / _evaluate, which keeps one definition of "cash".
"""
from __future__ import annotations

from pydantic import BaseModel

from app.plan.planner import PlanInputs, _build, _evaluate, _p50, _status_quo_mins
from app.plan.schemas import Band, Goal

Sched = list[tuple[float, float, float]]


class ScenarioParams(BaseModel):
    cut: float  # fraction of discretionary spend removed
    savings: float  # extra INR per month moved to savings
    extra_debt: float  # extra INR per month sent to the highest-APR debt


class ScenarioOutcome(BaseModel):
    id: str
    label: str
    description: str
    available: bool = True
    unavailable_reason: str | None = None
    monthly_cut: float = 0.0  # average INR of discretionary spending avoided per month (P50 forecast)
    monthly_savings: float = 0.0
    monthly_extra_debt: float = 0.0  # actually applied (capped by what is owed)
    cash: list[Band] = []  # per-month balance bands
    end_cash: Band | None = None
    shortfall_risk: float = 0.0  # P(cash < reserve in any month)
    p_negative: float = 0.0
    risk_delta: float = 0.0  # vs current spending
    total_savings: float = 0.0
    total_extra_debt: float = 0.0
    spending_avoided: float = 0.0
    ending_debt: float = 0.0
    debt_change: float = 0.0  # vs current spending (negative = less debt)
    interest_saved: float = 0.0
    net_worth_change: float = 0.0  # median end (cash + savings - debt) vs current spending
    goal_progress: float = 0.0
    value_built: float = 0.0  # savings + extra debt repaid + interest saved + spending avoided
    tradeoffs: list[str] = []


class Recommendation(BaseModel):
    scenario_id: str
    label: str
    within_tolerance: bool
    criteria: str
    rationale: str


class ScenarioComparison(BaseModel):
    params: ScenarioParams
    outcomes: list[ScenarioOutcome]
    recommendation: Recommendation | None


def _inr(x: float) -> str:
    return f"INR {x:,.0f}"


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def compare(inp: PlanInputs, params: ScenarioParams, labels: list[str]) -> ScenarioComparison:
    h = inp.horizon
    p50 = _p50(inp.paths, h)
    _, base_interest = _status_quo_mins(inp.debts, h)
    has_debt = any(d.principal > 0 for d in inp.debts)
    specs: list[tuple[str, str, str, tuple[float, float, float], str | None]] = [
        ("current", "Current spending", "No changes: same spending, no extra savings or repayments.", (0.0, 0.0, 0.0), None),
        ("cut_discretionary", "Reduce discretionary spending",
         f"Cut discretionary spending by {_pct(params.cut)} every month.", (params.cut, 0.0, 0.0), None),
        ("increase_savings", "Increase savings",
         f"Move {_inr(params.savings)} a month into savings.", (0.0, 0.0, params.savings), None),
        ("extra_debt", "Extra debt repayment",
         f"Send {_inr(params.extra_debt)} a month to the highest-interest debt on top of minimums.",
         (0.0, params.extra_debt, 0.0), None if has_debt else "No debts on record to repay."),
    ]

    outcomes: list[ScenarioOutcome] = []
    for sid, label, desc, (cut, extra, sav), why in specs:
        if why:
            outcomes.append(ScenarioOutcome(id=sid, label=label, description=desc, available=False, unavailable_reason=why))
            continue
        rows = _build(None, p50, inp.cash0, inp.debts, [(cut, extra, sav)] * h)
        seq = _evaluate(sid, label, desc, rows, inp.paths, inp, base_interest, labels, p50)
        per = seq.periods
        end = per[-1]
        savings_total = float(sum(p.savings_contrib for p in per))
        extra_total = float(sum(p.extra_debt for p in per))
        avoided = float(sum(p.discretionary_cut for p in per))
        outcomes.append(ScenarioOutcome(
            id=sid, label=label, description=desc,
            monthly_cut=round(avoided / h, 2), monthly_savings=round(savings_total / h, 2),
            monthly_extra_debt=round(extra_total / h, 2),
            cash=[Band(p10=p.cash_p10, p50=p.cash_p50, p90=p.cash_p90) for p in per],
            end_cash=Band(p10=end.cash_p10, p50=end.cash_p50, p90=end.cash_p90),
            shortfall_risk=seq.shortfall_risk, p_negative=seq.p_negative,
            total_savings=round(savings_total, 2), total_extra_debt=round(extra_total, 2),
            spending_avoided=round(avoided, 2), ending_debt=end.debt_balance,
            interest_saved=seq.interest_saved, goal_progress=seq.goal_progress,
            net_worth_change=round(end.cash_p50 + savings_total - end.debt_balance, 2),  # absolute for now
            value_built=round(savings_total + extra_total + seq.interest_saved + avoided, 2),
        ))

    base = outcomes[0]
    nw0, debt0, risk0 = base.net_worth_change, base.ending_debt, base.shortfall_risk
    for o in outcomes:
        if o.available:
            o.net_worth_change = round(o.net_worth_change - nw0, 2)
            o.debt_change = round(o.ending_debt - debt0, 2)
            o.risk_delta = round(o.shortfall_risk - risk0, 4)
            o.tradeoffs = _tradeoffs(o, base, inp.cash0, inp.constraints.risk_tolerance)
    return ScenarioComparison(params=params, outcomes=outcomes, recommendation=_recommend(outcomes, inp.constraints.risk_tolerance, inp.constraints.goal))


def _tradeoffs(o: ScenarioOutcome, base: ScenarioOutcome, cash0: float, tol: float) -> list[str]:
    out: list[str] = []
    if o.id == "current":
        out.append("Baseline for the other scenarios.")
        if o.shortfall_risk > tol:
            out.append(f"Shortfall risk {_pct(o.shortfall_risk)} is above your {_pct(tol)} tolerance.")
        return out
    end_gap = (o.end_cash.p50 - base.end_cash.p50) if o.end_cash and base.end_cash else 0.0
    cash_note = f"{_inr(abs(end_gap))} {'less' if end_gap <= 0 else 'more'} spendable cash"
    if o.id == "cut_discretionary":
        out.append(f"Spend {_inr(o.monthly_cut)} less a month on discretionary items.")
    if o.id == "increase_savings":
        out.append(f"Saves {_inr(o.total_savings)} over the horizon but leaves {cash_note}.")
    if o.id == "extra_debt":
        out.append(f"Repays {_inr(o.total_extra_debt)} extra and saves {_inr(o.interest_saved)} interest, "
                   f"but leaves {cash_note}.")
    if o.risk_delta > 0.005:
        out.append(f"Shortfall risk rises by {abs(o.risk_delta) * 100:.0f} pts to {_pct(o.shortfall_risk)}.")
    elif o.risk_delta < -0.005:
        out.append(f"Shortfall risk falls by {abs(o.risk_delta) * 100:.0f} pts to {_pct(o.shortfall_risk)}.")
    else:
        out.append("Shortfall risk is unchanged.")
    if o.shortfall_risk > tol:
        out.append(f"Outside your {_pct(tol)} risk tolerance.")
    return out


def _recommend(outcomes: list[ScenarioOutcome], tol: float, goal: Goal | None) -> Recommendation | None:
    avail = [o for o in outcomes if o.available]
    if not avail:
        return None
    ok = [o for o in avail if o.shortfall_risk <= tol]
    if not ok:
        best = min(avail, key=lambda o: (o.shortfall_risk, -o.value_built))
        return Recommendation(
            scenario_id=best.id, label=best.label, within_tolerance=False,
            criteria=f"No scenario keeps shortfall risk within {_pct(tol)}; picked the lowest-risk one.",
            rationale=f"{best.label} has the lowest shortfall risk ({_pct(best.shortfall_risk)}), but it is still above "
                      f"your {_pct(tol)} tolerance. Consider a larger spending cut, a lower reserve, or a longer horizon.",
        )
    pool, crit = ok, f"Highest value built among scenarios with shortfall risk within {_pct(tol)}."
    if goal:
        met = [o for o in ok if o.goal_progress >= 1 - 1e-9]
        if met:
            pool = met
            crit = f"Meets your goal of {_inr(goal.amount)} by month {goal.by_period} with risk within {_pct(tol)}; highest value built."
        else:
            crit = f"No scenario reaches the goal at the median; highest value built within {_pct(tol)} risk."
    best = max(pool, key=lambda o: (o.value_built, -o.shortfall_risk))
    if best.id == "current":
        why = "None of the changes adds enough value to justify its trade-offs, so keeping current spending is the pick."
    else:
        why = (f"It builds {_inr(best.value_built)} of value over the horizon while keeping shortfall risk at "
               f"{_pct(best.shortfall_risk)} (tolerance {_pct(tol)}).")
    return Recommendation(scenario_id=best.id, label=best.label, within_tolerance=True, criteria=crit, rationale=why)
