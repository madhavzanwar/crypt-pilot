// Integration-pass regressions: dashboard month anchored on today, secret_input detail, forecast error text and default seed.
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSpend, todayISO } from "../lib/spend.ts";
import { secretInputDetail, SecretInputError } from "../lib/apiError.ts";
import { friendlyForecastError, validateDraft, DEFAULT_SEED } from "../components/forecast-risk/forecastInputs.ts";

const tx = (date, amount, category = "groceries") => ({ id: date + amount, date, amount, category, merchant: "M", account_id: "a" });

test("a far-future row never becomes 'this month'", () => {
  const rows = [tx("2026-09-10", -100), tx("2026-10-05", -200), tx("2099-01-01", -1000), tx("2026-10-02", 50000, "income")];
  const s = summarizeSpend(rows, 6, "2026-10-30");
  assert.equal(s.latestMonth, "2026-10");
  assert.equal(s.months.at(-1).spend, 200);
  assert.ok(!s.months.some((m) => m.month === "2099-01"));
});

test("todayISO is the local calendar date", () => {
  assert.equal(todayISO(new Date(2026, 9, 30, 23, 59)), "2026-10-30");
});

test("secret_input body gives the friendly detail only for that error", () => {
  const body = JSON.stringify({ error: "secret_input", detail: "This looks like a seed phrase." });
  assert.equal(secretInputDetail(400, body), "This looks like a seed phrase.");
  assert.equal(secretInputDetail(422, body), null);
  assert.equal(secretInputDetail(400, JSON.stringify({ detail: "other" })), null);
  assert.equal(secretInputDetail(400, "not json"), null);
  assert.equal(new SecretInputError("x").message, "x");
});

test("forecast errors keep an already friendly sentence and the form defaults to the engine seed", () => {
  assert.equal(friendlyForecastError("Reserve must be at least 0."), "Reserve must be at least 0.");
  assert.match(friendlyForecastError("API /x?y=1 failed: 500 boom"), /service had a problem/);
  assert.match(friendlyForecastError('{"a":1}'), /could not be run/);
  const d = { reserve: "", savings: "", extra_debt: "", goal_amount: "", goal_month: "", cut: "20", sims: "2000", seed: "" };
  assert.equal(validateDraft(d, { horizon: 6 }, 6).query.seed, DEFAULT_SEED);
});
