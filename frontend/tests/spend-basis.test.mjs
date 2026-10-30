// node --experimental-strip-types --test tests/spend-basis.test.mjs
// Client income/spend must follow the backend basis (app/analytics/basis.py): only transfers and card-bill payments are excluded.
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSpend } from "../lib/spend.ts";
const t = (date, amount, category, merchant = "m") => ({ id: date + amount + category, date, amount, category, merchant });
test("refunds count as income, transfers and card payments as neither", () => {
  const s = summarizeSpend([
    t("2026-09-01", 50000, "income"), t("2026-09-05", 800, "shopping"), t("2026-09-06", -3000, "shopping"),
    t("2026-09-07", -9000, "transfer"), t("2026-09-08", 9000, "transfer"), t("2026-09-09", -4000, "credit_card_payment"),
    t("2026-09-10", -1000, "groceries"),
  ], 6, "2026-09-30");
  const m = s.months.at(-1);
  assert.equal(m.income, 50800);
  assert.equal(m.spend, 4000);
});
