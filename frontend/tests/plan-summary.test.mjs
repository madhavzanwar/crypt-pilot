// Plain-language plan summary: pure functions in lib/planSummary.ts, English and Hindi/Marathi rendering.
import test from "node:test";
import assert from "node:assert/strict";
import { planActions, summarisePlan, summaryParts, summaryPlainText, formatMonth, recommendedSequence } from "../lib/planSummary.ts";
import { tm } from "../components/i18nMoney.ts";

const MONTHS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
const period = (i, over = {}) => ({
  period: i + 1, month: MONTHS[i], income: 100000, essential: 40000, discretionary: 30000, discretionary_cut: 0, debt_min: 10000,
  extra_debt: 0, savings_contrib: 0, cash_end: 300000, cash_p10: 280000, cash_p50: 300000, cash_p90: 320000, debt_balance: 0, reserve_ok: true, ...over,
});
const seq = (id, label, periods, over = {}) => ({ id, label, description: "", periods, shortfall_risk: 0, p_negative: 0, goal_met_p50: false, goal_progress: 0, interest_saved: 0, objective: 0, ...over });
const plan = (sequences, over = {}) => ({
  method: { name: "m", horizon_months: 6, n_paths: 2000, seed: 1, window_months: 24, pi_level: 0.8, description: "" },
  constraints: { min_reserve: 40000, max_discretionary_cut: 0.3, goal: null, risk_tolerance: 0.1, policy_cut: 0.2 },
  starting_cash: 400000, forecast: [], sequences, feasible: true, conflicts: [], relaxations: [], recommended_id: sequences[0].id,
  p50_only_best_id: sequences[0].id, uncertainty_changed_choice: false, rationale: "", risk_adjusted: null, ...over,
});
const money = (n) => `R${Math.round(n)}`;
const en = (k) => tm("en", k);

const debtFirst = () =>
  seq("debt_first", "Debt first", MONTHS.map((_, i) => period(i, { discretionary_cut: 6000, extra_debt: i === 0 ? 100000 : 20000, cash_end: 250000 + i, cash_p10: 200000, cash_p50: 250000 + i * 1000, cash_p90: 300000 })));

test("normal case: recommended plan, first 3 actions in order with amounts and timing, month-6 range, reserve holds", () => {
  const d = summarisePlan(plan([debtFirst()]));
  assert.equal(d.label, "Debt first");
  assert.deepEqual(d.actions.map((a) => [a.kind, a.fromMonth, a.toMonth, a.amount]), [
    ["cut", "2026-10", "2027-03", 6000],
    ["extra_debt", "2026-10", "2026-10", 100000],
    ["extra_debt", "2026-11", "2027-03", 20000],
  ]);
  const p = summaryParts(d, en, money);
  assert.equal(p.steps.length, 3);
  assert.match(p.steps[0], /Oct 2026 to Mar 2027: cut discretionary spending by about R6000 a month/);
  assert.match(p.steps[1], /^In Oct 2026: pay about R100000 extra towards your debt/);
  assert.match(p.steps[2], /Nov 2026 to Mar 2027: pay about R20000 extra/);
  assert.match(p.outlook, /By the end of Mar 2027 you are most likely to have about R255000, with a likely range of R200000 to R300000/);
  assert.match(p.reserve, /holds: in the worst realistic case \(the bottom of the band\) your balance stays above it in all 6 months/);
  assert.equal(p.goal, null);
  assert.equal(p.more, null);
  const text = summaryPlainText("Title", p);
  assert.match(text, /^Title\n\nRecommended plan: Debt first/);
  assert.match(text, /\n1\. .*\n2\. .*\n3\. /);
});

test("status quo needs no changes", () => {
  const d = summarisePlan(plan([seq("status_quo", "Status quo", MONTHS.map((_, i) => period(i)))]));
  assert.equal(d.actions.length, 0);
  assert.match(summaryParts(d, en, money).intro, /needs no changes to your spending/);
});

test("more actions are counted, not listed", () => {
  const periods = MONTHS.map((_, i) => period(i, { discretionary_cut: 1000, extra_debt: 1000 * (i + 1) * 2, savings_contrib: 5000 }));
  const d = summarisePlan(plan([seq("save_first", "Save first", periods)]));
  assert.equal(d.actions.length, 3);
  assert.ok(d.moreActions > 0);
  assert.match(summaryParts(d, en, money).more, /more steps in the full plan below/);
});

test("reserve breach at the bottom of the band names the first month", () => {
  const ps = MONTHS.map((_, i) => period(i, { cash_p10: i >= 3 ? 30000 : 90000, cash_p50: 150000 }));
  const d = summarisePlan(plan([seq("save_first", "Save first", ps)]));
  assert.equal(d.reserve.status, "p10_dips");
  assert.equal(d.reserve.breachIndex, 4);
  const p = summaryParts(d, en, money);
  assert.match(p.reserve, /holds on the most likely path, but in the worst realistic case \(the bottom of the band\) your balance dips below it in month 4 \(Jan 2027\)/);
});

test("reserve breach on the median path is called out as such", () => {
  const ps = MONTHS.map((_, i) => period(i, { cash_p10: 10000, cash_p50: i === 2 ? 20000 : 90000 }));
  const d = summarisePlan(plan([seq("status_quo", "Status quo", ps)]));
  assert.equal(d.reserve.status, "p50_dips");
  assert.equal(d.reserve.breachIndex, 3);
  assert.match(summaryParts(d, en, money).reserve, /even on the most likely path .* month 3 \(Dec 2026\)/);
});

test("goal: on track, short of the goal, and in conflict", () => {
  const goal = { kind: "savings_or_debt", amount: 60000, by_period: 6 };
  const mk = (over, seqOver) => {
    const base = plan([seq("save_first", "Save first", MONTHS.map((_, i) => period(i)), seqOver)], over);
    base.constraints.goal = goal;
    return summaryParts(summarisePlan(base), en, money).goal;
  };
  assert.match(mk({}, { goal_met_p50: true, goal_progress: 1 }), /goal of R60000 by Mar 2027 is on track on the most likely path/);
  assert.match(mk({}, { goal_met_p50: false, goal_progress: 0.364 }), /not fully reached on the most likely path; this plan gets you about 36% of the way/);
  assert.match(mk({ feasible: false }, {}), /cannot be met together with your safety reserve/);
});

test("no goal: no goal sentence", () => {
  assert.equal(summaryParts(summarisePlan(plan([debtFirst()])), en, money).goal, null);
});

test("recommended sequence resolves the risk-adjusted one and ignores unknown ids", () => {
  const ra = seq("risk_adjusted_save_first", "Save first (risk-adjusted)", MONTHS.map((_, i) => period(i)));
  const p = plan([debtFirst()], { risk_adjusted: ra, recommended_id: ra.id });
  assert.equal(recommendedSequence(p).id, ra.id);
  assert.equal(summaryParts(summarisePlan(p), en, money).intro.includes("Save first (risk-adjusted)"), true);
  assert.equal(recommendedSequence(plan([debtFirst()], { recommended_id: "nope" })).id, "debt_first");
});

test("planActions splits runs when the amount changes by more than 5%", () => {
  const ps = [period(0, { savings_contrib: 1000 }), period(1, { savings_contrib: 1040 }), period(2, { savings_contrib: 2000 })];
  assert.deepEqual(planActions(ps).map((a) => [a.fromMonth, a.toMonth, a.months]), [["2026-10", "2026-11", 2], ["2026-12", "2026-12", 1]]);
});

test("Hindi and Marathi render with no English fallback and no unfilled placeholders", () => {
  const goal = { kind: "savings_or_debt", amount: 60000, by_period: 6 };
  const p = plan([debtFirst()]);
  p.constraints.goal = goal;
  for (const lang of ["hi", "mr"]) {
    const parts = summaryParts(summarisePlan(p), (k) => tm(lang, k), money, `${lang}-IN`);
    const all = [parts.intro, ...parts.steps, parts.outlook, parts.reserve, parts.goal].join(" ");
    assert.match(all, /[ऀ-ॿ]/);
    assert.doesNotMatch(all, /\{\w+\}/);
    assert.doesNotMatch(all, /Debt first|extra towards|most likely/);
  }
});

test("month labels follow the locale", () => {
  assert.equal(formatMonth("2026-10", "en-IN"), "Oct 2026");
  assert.notEqual(formatMonth("2026-10", "hi-IN"), "Oct 2026");
});
