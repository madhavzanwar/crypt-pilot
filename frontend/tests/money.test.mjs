// BUG-023 / BUG-057 / BUG-021: node --experimental-strip-types --test tests/money.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatAxisMoney, formatCurrency, MONEY_CURRENCIES as C, hasAmount } from "../components/ui/money.ts";

test("INR uses lakh grouping and no stray space", () => {
  assert.equal(formatMoney(133760), "₹1,33,760");
  assert.equal(formatMoney(405000), "₹4,05,000");
  assert.ok(!/\d, \d/.test(formatMoney(133760)));
});

test("sign comes before the symbol", () => {
  assert.equal(formatMoney(-303), "-₹303");
  assert.equal(formatMoney(-650), "-₹650");
  assert.equal(formatMoney(9833, C.INR, { sign: "always" }), "+₹9,833");
  assert.equal(formatMoney(-8831, C.INR, { sign: "always" }), "-₹8,831");
  for (const v of [-303, 303, -0.4, 12.6]) assert.ok(!/₹[-+]/.test(formatMoney(v, C.INR, { sign: "always" })));
});

test("values that round to zero never print a negative zero", () => {
  for (const v of [-0, -0.2, -0.49, 0, 0.3]) assert.equal(formatMoney(v), "₹0", String(v));
  assert.equal(formatMoney(-0.2, C.INR, { sign: "always" }), "₹0");
  assert.equal(formatMoney(-0.004, C.USD), "$0.00");
  assert.ok(!formatMoney(-0.2, C.USD).includes("-"));
});

test("non-finite input is zero", () => {
  assert.equal(formatMoney(NaN), "₹0");
  assert.equal(formatMoney(Infinity), "₹0");
});

test("other currencies convert and keep sign first", () => {
  assert.equal(formatMoney(100000, C.USD), "$1,160");
  assert.equal(formatMoney(-100000, C.USD), "-$1,160");
  assert.match(formatMoney(100000, C.EUR), /1\.070\s?€|€\s?1\.070/);
  assert.equal(formatMoney(100000, C.GBP), "£900");
  assert.match(formatMoney(500, C.USD), /^\$5\.80$/);
  assert.ok(!/[٠-٩]/.test(formatMoney(1000, C.AED)), "AED uses Latin digits");
});

test("axis labels follow the currency and say zero as zero", () => {
  assert.equal(formatAxisMoney(0), "₹0");
  assert.equal(formatAxisMoney(0, C.USD), "$0");
  assert.match(formatAxisMoney(20000), /^₹20K$|^₹20k$/i);
  assert.match(formatAxisMoney(20000, C.USD), /^\$232$/);
  assert.ok(!formatAxisMoney(2000000, C.USD).includes("₹"));
  assert.ok(formatAxisMoney(-20000).startsWith("-₹"));
});

test("formatCurrency(value, 'USD') treats the value as already in that currency", () => {
  assert.equal(formatCurrency(1234, "USD"), "$1,234");
  assert.equal(formatCurrency(-5), "-₹5");
});

test("amount detector finds money and ignores plain numbers", () => {
  for (const s of ["You also owe ₹3,18,500", "-₹650 monthly", "$1,160", "1,160 €", "Total AED 40", "12 USD"]) assert.ok(hasAmount(s), s);
  for (const s of ["126%", "Priya", "29 Oct 2026", "3 transactions"]) assert.ok(!hasAmount(s), s);
});
