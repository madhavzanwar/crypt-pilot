// QA2-7: invalid Forecast & Risk inputs are rejected inline; API failures never leak the URL or JSON.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft, friendlyForecastError } from "../components/forecast-risk/forecastInputs.ts";

const ok = { reserve: "", savings: "", extra_debt: "", goal_amount: "", goal_month: "", cut: "20", sims: "2000", seed: "42" };
const q = { source: "real", horizon: 6 };

test("valid draft yields a query", () => {
  const r = validateDraft(ok, q, 6);
  assert.deepEqual(r.errors, {});
  assert.equal(r.query.cut, 0.2);
});
test("bad values are reported, nothing is sent", () => {
  for (const [k, v] of [["reserve", "-100"], ["savings", "-5"], ["cut", "50"], ["sims", "100"], ["sims", "20000"], ["seed", "-1"], ["extra_debt", "abc"]]) {
    const r = validateDraft({ ...ok, [k]: v }, q, 6);
    assert.ok(r.errors[k], `${k}=${v}`);
    assert.equal(r.query, null);
  }
  assert.ok(validateDraft({ ...ok, goal_amount: "1000", goal_month: "0" }, q, 6).errors.goal_month);
  assert.ok(validateDraft({ ...ok, goal_amount: "1000", goal_month: "99" }, q, 6).errors.goal_month);
  assert.ok(validateDraft({ ...ok, goal_amount: "1000" }, q, 6).errors.goal_month);
  assert.ok(validateDraft({ ...ok, goal_month: "3" }, q, 6).errors.goal_amount);
  assert.equal(validateDraft({ ...ok, goal_amount: "1000", goal_month: "6" }, q, 6).query.goal_month, 6);
});
test("friendly errors hide URL and JSON", () => {
  const raw = 'API /api/forecast-risk/demo-priya?source=real&reserve=-100 failed: 422 {"detail":[{"type":"greater_than_equal","msg":"Input should be greater than or equal to 0"}]}';
  const m = friendlyForecastError(raw);
  assert.ok(!/api\/|\{|\?source/.test(m), m);
  assert.match(m, /cannot be used/);
  assert.match(friendlyForecastError("API /x failed: 422"), /cannot be used/);
  assert.match(friendlyForecastError("API /x failed: 503 oops"), /service had a problem/);
  assert.match(friendlyForecastError("Failed to fetch"), /Could not reach/);
});
