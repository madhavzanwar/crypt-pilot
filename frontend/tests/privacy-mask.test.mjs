import test from "node:test";
import assert from "node:assert/strict";
import { maskAmounts } from "../components/ui/maskAmounts.ts";

test("maskAmounts removes amounts in any currency/order and keeps other text", () => {
  assert.equal(maskAmounts("Net worth ₹4,05,000 today"), "Net worth •••• today");
  assert.equal(maskAmounts("Spent -$1,234.50 and €99"), "Spent •••• and ••••");
  assert.equal(maskAmounts("1,000 INR left"), "•••• left");
  assert.equal(maskAmounts("₹1.2Cr"), "••••");
  assert.equal(maskAmounts("Health 84 / 100"), "Health 84 / 100");
});
