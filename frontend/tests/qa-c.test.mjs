// QA-C fixes: node --experimental-strip-types --test tests/qa-c.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatApiError } from "../lib/apiError.ts";
import { validateAmount, validateText, validateEventDate, validateForecast, validateGross, humanize, humanizeSlugs } from "../lib/validate.ts";
import { TranslateCache, COOLDOWN_MS } from "../lib/translateCache.ts";
import { localizeMoneyText, formatMoney } from "../lib/format.ts";

const forecastOk = { reserve: "", cut: "20", savings: "", extra_debt: "", goal_amount: "", goal_month: "", sims: "2000", seed: "20240601" };

test("422 detail array becomes a friendly sentence without URL or JSON", () => {
  const body = JSON.stringify({ detail: [{ type: "greater_than_equal", loc: ["query", "reserve"], msg: "x", ctx: { ge: 0 } }] });
  const m = formatApiError(422, body);
  assert.equal(m, "Cash reserve must be at least 0.");
  assert.ok(!/api\/|\{|http|422/i.test(m));
  assert.equal(formatApiError(422, JSON.stringify({ detail: [{ type: "less_than_equal", loc: ["query", "goal_month"], ctx: { le: 60 } }] })), "Goal month must be at most 60.");
  assert.ok(!formatApiError(500, "<html>boom</html>").includes("<"));
  assert.equal(formatApiError(400, JSON.stringify({ detail: "That OTP is not correct" })), "That OTP is not correct");
  assert.ok(!/\d{3}/.test(formatApiError(418, "garbage")));
});

test("forecast form validation", () => {
  assert.deepEqual(validateForecast(forecastOk), {});
  assert.ok(validateForecast({ ...forecastOk, reserve: "-100" }).reserve);
  assert.ok(validateForecast({ ...forecastOk, seed: "-5" }).seed);
  assert.ok(validateForecast({ ...forecastOk, goal_amount: "5000", goal_month: "0" }).goal_month);
  assert.ok(validateForecast({ ...forecastOk, goal_amount: "5000", goal_month: "99" }).goal_month);
  assert.ok(validateForecast({ ...forecastOk, goal_amount: "5000" }).goal_month);
  assert.ok(validateForecast({ ...forecastOk, cut: "50" }).cut);
  assert.ok(validateForecast({ ...forecastOk, sims: "100" }).sims);
  assert.ok(validateForecast({ ...forecastOk, sims: "" }).sims);
});

test("timeline / twin / tax validation", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  assert.equal(validateAmount("1000"), null);
  assert.ok(validateAmount(""));
  assert.ok(validateAmount("-50"));
  assert.ok(validateAmount("0"));
  assert.ok(validateAmount("1e20"));
  assert.ok(validateAmount("abc"));
  assert.ok(validateText("   ", "Merchant name"));
  assert.equal(validateText("Rent"), null);
  assert.ok(validateText("x".repeat(500)));
  assert.ok(validateEventDate("", now));
  assert.ok(validateEventDate("2099-01-01", now));
  assert.equal(validateEventDate("2026-12-01", now), null);
  assert.ok(validateGross("-100000"));
  assert.ok(validateGross(""));
  assert.equal(validateGross("1200000"), null);
});

test("slugs are humanised", () => {
  assert.equal(humanize("credit_card_payment"), "Credit card payment");
  assert.equal(humanizeSlugs("Adds a credit_card_payment of 500"), "Adds a credit card payment of 500");
});

test("translate cache: each string is sent once, failures back off", async () => {
  const store = new Map();
  const st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let calls = 0;
  let now = 0;
  const c = new TranslateCache(async (_l, texts) => (calls++, Object.fromEntries(texts.map((t) => [t, `hi:${t}`]))), () => st, () => now);
  const [a, b] = await Promise.all([c.translate("hi", ["One", "Two"]), c.translate("hi", ["Two", "One"])]);
  assert.equal(a.One, "hi:One");
  assert.equal(b.Two, "hi:Two");
  assert.equal(calls, 1, "concurrent identical requests are merged");
  await c.translate("hi", ["One"]);
  assert.equal(calls, 1);
  // new instance (a new page load) reads localStorage and does not call again
  const c2 = new TranslateCache(async () => { calls++; return {}; }, () => st);
  assert.equal((await c2.translate("hi", ["One"])).One, "hi:One");
  assert.equal(calls, 1);
  // failure: cool-down, no more calls
  let fails = 0;
  const c3 = new TranslateCache(async () => { fails++; throw new Error("429"); }, () => st, () => now);
  assert.deepEqual(await c3.translate("mr", ["Hello"]), {});
  await c3.translate("mr", ["Hello", "World"]);
  assert.equal(fails, 1);
  now = COOLDOWN_MS + 1;
  await c3.translate("mr", ["Hello"]);
  assert.equal(fails, 2);
});

test("money text: no negative monthly, active currency", () => {
  assert.equal(localizeMoneyText("₹-303 monthly", { absolute: true, currency: "INR" }), "₹303 monthly");
  assert.equal(localizeMoneyText("saves ~Rs 9,833 in interest", { currency: "INR" }), "saves ~₹9,833 in interest");
  assert.equal(localizeMoneyText("Rs 1,06,092/mo", { currency: "EUR" }), `${formatMoney(106092, "EUR")}/mo`);
  assert.ok(!localizeMoneyText("Rs 705/month", { currency: "USD" }).includes("Rs"));
  assert.equal(formatMoney(-303, "INR"), "-₹303");
});
