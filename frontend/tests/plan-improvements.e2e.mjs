// Playwright checks for the Plan page improvements: plain-words summary, band caption, Advanced settings, readiness-first
// first-time state, copy button, and no horizontal overflow at 390 and 1366.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers BASE=http://localhost:3780 node tests/plan-improvements.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(process.env.PW_FROM ?? "/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3780";
const GUEST = "guest-planready00001";

const browser = await chromium.launch();
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

async function open(path, { persona = "demo-priya", lang = "en", width = 1366, route } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([persona, lang]) => {
    try {
      localStorage.setItem("finpilot:demo_mode", "1");
      localStorage.setItem("finpilot:onboarded", "1");
      localStorage.setItem("finpilot_lang", lang);
      localStorage.setItem("finpilot:user_id", persona);
    } catch {}
  }, [persona, lang]);
  const page = await ctx.newPage();
  const reqs = [];
  const logs = [];
  page.on("request", (r) => reqs.push(r.url()));
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  if (route) await route(page);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  return { ctx, page, reqs, logs };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ---- items 1 and 2 (and copy) ----
await check("summary card, band caption and legend on the demo persona", async () => {
  const { ctx, page } = await open("/plan");
  const card = page.getByTestId("plan-summary");
  await card.waitFor({ timeout: 30000 });
  const t = await card.innerText();
  assert.match(t, /Your plan in plain words/);
  assert.match(t, /Recommended plan: Debt first/);
  assert.match(t, /1\. |From Oct 2026 to Mar 2027: cut discretionary spending/);
  assert.match(t, /By the end of Mar 2027 you are most likely to have about ₹[\d,]+, with a likely range of ₹[\d,]+ to ₹[\d,]+/);
  assert.match(t, /stays above it in all 6 months/);
  assert.match(t, /goal of ₹60,000 by Mar 2027 is on track/);
  const cap = await page.locator(".plan-screen").getByTestId("plan-chart-caption").innerText();
  assert.match(cap, /solid line is the most likely path \(the median, P50\)/);
  assert.match(cap, /middle 80% of simulated outcomes \(P10 to P90\)/);
  assert.match(cap, /about 8 out of 10 simulations fall inside it/);
  assert.match(cap, /about 9 out of 10 simulations are above its bottom edge/);
  assert.match(cap, /dashed line is your safety reserve/);
  assert.doesNotMatch(cap, /9 out of 10 (simulations )?(fall|stay|are) inside/);
  assert.match(cap, /In none of the 2000 simulations for Debt first does cash dip below the reserve/);
  const key = await page.locator(".plan-screen").getByTestId("plan-chart-key").innerText();
  assert.match(key, /Most likely path/);
  assert.match(key, /Middle 80%/);
  assert.match(key, /Your safety reserve/);
  await ctx.close();
});

await check("Copy summary copies the text and shows Copied", async () => {
  const { ctx, page } = await open("/plan");
  await page.getByTestId("plan-copy").click({ timeout: 30000 });
  await page.getByTestId("plan-copied").filter({ hasText: "Copied" }).waitFor({ timeout: 3000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^Your plan in plain words\n\nRecommended plan: Debt first/);
  assert.match(clip, /By the end of Mar 2027/);
  await ctx.close();
});

await check("reserve-dip persona names the month and shows the simulated chance", async () => {
  const { ctx, page } = await open("/plan", { persona: "demo-meera" });
  const t = await page.getByTestId("plan-summary").innerText({ timeout: 30000 });
  assert.match(t, /dips below it in month 1 \(Oct 2026\)/);
  assert.match(t, /cannot be met together with your safety reserve/);
  assert.match(await page.locator(".plan-screen").getByTestId("plan-chart-caption").innerText(), /In 47% of the 2000 simulations for Status quo, cash dips below the reserve in at least one month/);
  await ctx.close();
});

await check("Hindi and Marathi summary and caption are translated", async () => {
  for (const [lang, re] of [["hi", /आपकी योजना सरल शब्दों में[\s\S]*सुझाई गई योजना/], ["mr", /तुमची योजना सोप्या शब्दांत[\s\S]*सुचवलेली योजना/]]) {
    const { ctx, page } = await open("/plan", { lang });
    const t = await page.getByTestId("plan-summary").innerText({ timeout: 30000 });
    assert.match(t, re);
    assert.doesNotMatch(t, /Recommended plan|most likely/);
    assert.match(await page.locator(".plan-screen").getByTestId("plan-chart-caption").innerText(), /[ऀ-ॿ]{3}/);
    await ctx.close();
  }
});

// ---- item 3 ----
await check("Advanced settings: collapsed by default, keyboard accessible, remembered, same query params", async () => {
  const { ctx, page, reqs } = await open("/plan");
  const btn = page.getByRole("button", { name: "Advanced settings" });
  await btn.waitFor({ timeout: 30000 });
  assert.equal(await btn.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByTestId("plan-engine-info").isVisible(), false);
  assert.equal(await page.getByText("Risk tolerance (0-1)").isVisible(), false);
  await btn.focus();
  await page.keyboard.press("Enter");
  assert.equal(await btn.getAttribute("aria-expanded"), "true");
  const info = await page.getByTestId("plan-engine-info").innerText();
  assert.match(info, /Simulations:\s*2000/);
  assert.match(info, /Random seed:\s*20240601/);
  await page.reload({ waitUntil: "domcontentloaded" });
  const btn2 = page.getByRole("button", { name: "Advanced settings" });
  await btn2.waitFor({ timeout: 30000 });
  assert.equal(await btn2.getAttribute("aria-expanded"), "true", "open state remembered in sessionStorage");
  await page.getByLabel("Risk tolerance (0-1)").fill("0.2");
  await page.getByLabel("Min reserve").fill("50000");
  const before = reqs.length;
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.waitForTimeout(1500);
  const planReq = reqs.slice(before).find((u) => /\/api\/plan\/demo-priya\?/.test(u));
  assert.ok(planReq, "plan request sent with params");
  const q = new URL(planReq).searchParams;
  assert.equal(q.get("reserve"), "50000");
  assert.equal(q.get("tolerance"), "0.2");
  assert.deepEqual([...q.keys()].sort(), ["reserve", "tolerance"]);
  await page.keyboard.press("Tab"); // focus stays reachable
  await btn2.focus();
  await page.keyboard.press("Space");
  assert.equal(await btn2.getAttribute("aria-expanded"), "false");
  await ctx.close();
});

// ---- item 5 ----
await check("new guest: readiness first, no plan request, friendly card with 0 of 4, no 422 console noise", async () => {
  const { ctx, page, reqs, logs } = await open("/plan", { persona: GUEST });
  const card = page.getByTestId("plan-not-ready");
  await card.waitFor({ timeout: 30000 });
  assert.match(await card.innerText(), /Your plan needs about 4 months of history/);
  assert.match(await page.getByTestId("plan-progress-text").innerText(), /You have 0 of 4 months/);
  const bar = card.getByRole("progressbar");
  assert.equal(await bar.getAttribute("aria-valuenow"), "0");
  assert.equal(await bar.getAttribute("aria-valuemax"), "4");
  assert.ok(await card.getByRole("link", { name: "Upload a statement" }).isVisible());
  assert.equal(await card.getByRole("link", { name: "Connect a source" }).getAttribute("href"), "/connect");
  assert.equal(await card.getByRole("link", { name: "Upload a statement" }).getAttribute("href"), "/upload");
  assert.ok(await card.getByRole("button", { name: "Try with a demo person" }).isVisible());
  await page.waitForTimeout(1500);
  assert.ok(reqs.some((u) => new RegExp(`/api/plan/${GUEST}/readiness`).test(u)), "readiness requested");
  assert.ok(!reqs.some((u) => new RegExp(`/api/plan/${GUEST}(\\?|$)`).test(u)), "plan not requested");
  assert.ok(!logs.some((l) => /422/.test(l)), `422 in console: ${logs.filter((l) => /422/.test(l)).join("|")}`);
  assert.equal(await page.getByRole("button", { name: "Download plan as PDF" }).count(), 0);
  await ctx.close();
});

await check("guest card: demo button switches to a demo persona and the plan appears", async () => {
  const { ctx, page } = await open("/plan", { persona: GUEST });
  await page.getByRole("button", { name: "Try with a demo person" }).click({ timeout: 30000 });
  await page.getByTestId("plan-summary").waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("finpilot:user_id")), "demo-priya");
  await ctx.close();
});

await check("partial history shows 2 of 4 (mocked readiness); demo persona has no demo button", async () => {
  const { ctx, page } = await open("/plan", {
    persona: "demo-arjun",
    route: (p) => p.route(/\/api\/plan\/demo-arjun\/readiness/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ready: false, months_available: 2, months_needed: 4 }) })),
  });
  await page.getByTestId("plan-not-ready").waitFor({ timeout: 30000 });
  assert.match(await page.getByTestId("plan-progress-text").innerText(), /You have 2 of 4 months/);
  assert.equal(await page.getByRole("button", { name: "Try with a demo person" }).count(), 0);
  await ctx.close();
});

await check("first-time card is translated (Hindi, Marathi)", async () => {
  for (const [lang, re] of [["hi", /आपकी योजना के लिए लगभग [4४] महीनों का इतिहास चाहिए/], ["mr", /तुमच्या योजनेसाठी सुमारे [4४] महिन्यांचा इतिहास हवा/]]) {
    const { ctx, page } = await open("/plan", { persona: GUEST, lang });
    const t = await page.getByTestId("plan-not-ready").innerText({ timeout: 30000 });
    assert.match(t, re);
    assert.doesNotMatch(t, /Upload a statement|Connect a source/);
    await ctx.close();
  }
});

// ---- layout ----
for (const width of [390, 1366]) {
  await check(`no horizontal overflow at ${width}px (plan, first-time card)`, async () => {
    const a = await open("/plan", { width });
    await a.page.getByTestId("plan-summary").waitFor({ timeout: 30000 });
    await a.page.getByRole("button", { name: "Advanced settings" }).click();
    await a.page.waitForTimeout(500);
    assert.ok((await overflow(a.page)) <= 1, `plan overflows by ${await overflow(a.page)}px`);
    await a.ctx.close();
    const b = await open("/plan", { width, persona: GUEST });
    await b.page.getByTestId("plan-not-ready").waitFor({ timeout: 30000 });
    assert.ok((await overflow(b.page)) <= 1, `not-ready overflows by ${await overflow(b.page)}px`);
    await b.ctx.close();
  });
}

await browser.close();
if (failures) process.exit(1);
