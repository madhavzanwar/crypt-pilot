// BUG-023: no "-₹0"; BUG-031 guarded storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatCurrency } from "../lib/format.ts";

test("zero and negative zero never show a minus", () => {
  for (const v of [0, -0, -0.3, -0.4, -1e-9]) {
    const out = formatMoney(v, "INR");
    assert.ok(!out.includes("-"), `${v} -> ${out}`);
    assert.ok(out.includes("0"));
  }
  assert.ok(!formatMoney(-0.4, "USD").includes("-"));
  assert.ok(!formatCurrency(-0).includes("-"));
});

test("real negatives keep a sign before the symbol", () => {
  assert.match(formatMoney(-303, "INR"), /^-₹303$/);
  assert.match(formatMoney(-1500000, "INR"), /^-₹15,00,000$/);
});

test("formatCurrency survives missing window/localStorage", () => {
  assert.equal(formatCurrency(1234), "₹1,234");
});
