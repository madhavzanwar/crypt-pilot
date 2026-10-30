// QA4-6 / QA2-9: money inputs convert display <-> INR; tax copy states the FY25-26 new-regime rebate limit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toDisplayAmount, fromDisplayAmount, MONEY_CURRENCIES as C } from "../components/ui/money.ts";

test("display/INR round trip", () => {
  assert.equal(toDisplayAmount(10000, C.INR), 10000);
  const shown = toDisplayAmount(10000, C.EUR);
  assert.equal(shown, 107);
  assert.ok(Math.abs(fromDisplayAmount(shown, C.EUR) - 10000) < 1);
  assert.equal(fromDisplayAmount(Number.NaN, C.EUR), 0);
});

test("tax copy: no stale 7.75 Lakhs rebate, no hard-coded rupee signs", () => {
  const src = readFileSync(new URL("../components/tax/TaxRegimeComparison.tsx", import.meta.url), "utf8");
  assert.ok(!/7\.75/.test(src));
  assert.ok(src.includes("formatCurrency(1275000)"));
  assert.ok(!src.includes("₹"));
});
