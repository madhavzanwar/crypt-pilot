// QA6-2/6-7/6-13: recurring magnitude, budget definition, honest connector text, translated money labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budgetTotals } from "../components/dashboard/budgetMath.ts";
import { MONEY_KEYS, tm } from "../components/i18nMoney.ts";

test("used and remaining add to 100 and include rollover and all budgets", () => {
  const r = budgetTotals([
    { monthly_limit: 10000, spent_so_far: 6000, rollover_amount: 0 },
    { monthly_limit: 5000, spent_so_far: 3000, rollover_amount: 1000 },
    { monthly_limit: 1000, spent_so_far: 0 },
  ]);
  assert.equal(r.usedPct, Math.round((9000 / 17000) * 100));
  assert.equal(r.usedPct + r.remainingPct, 100);
  assert.equal(budgetTotals([]).remainingPct, null);
  assert.equal(budgetTotals([{ monthly_limit: 100, spent_so_far: 500 }]).remainingPct, 0);
});

test("recurring card uses the magnitude of negative amounts", () => {
  const src = readFileSync(new URL("../components/dashboard/MoneySummary.tsx", import.meta.url), "utf8");
  assert.match(src, /Math\.abs\(o\.amount\)/);
});

test("money keys have Devanagari hi/mr text", () => {
  for (const k of MONEY_KEYS) for (const l of ["hi", "mr"]) {
    assert.match(tm(l, k), /[ऀ-ॿ]/, `${k} ${l}`);
    assert.notEqual(tm(l, k), tm("en", k));
  }
});

test("household card has no hard-coded people and saves through the API", () => {
  const src = readFileSync(new URL("../components/household/SharedExpensesCard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Rishi|Priya/);
  assert.match(src, /api\.addSharedExpense/);
  assert.match(src, /api\.addSettlement/);
});
