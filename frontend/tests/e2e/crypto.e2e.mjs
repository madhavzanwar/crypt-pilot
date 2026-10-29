// Playwright checks for the crypto UI against a running frontend (default http://localhost:3200).
// Every /api/crypto/* call is mocked in the browser, so no backend or credits are needed:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers BASE=http://localhost:3200 node tests/e2e/crypto.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(process.env.PW_FROM ?? "/opt/node-tools/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3200";
const ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const OLD = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const HEX = "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262";

const checkBody = (address, creditsRemaining) => ({
  status: "ok", address, chain: "bitcoin", verdict: "WARN", riskScore: 41, datasetLabel: "unknown", hopsToNearestIllicit: 2,
  neighbors: { hop1: { illicit: 0, licit: 1, unknown: 1 }, hop2: { illicit: 1, licit: 1, unknown: 2 } },
  graphFeatures: {}, labelHits: { ofac: false, ransomwhere: false }, topReasons: ["Two hops from an illicit wallet"],
  subgraph: { nodes: [{ id: address, label: "unknown", hop: 0, isSubject: true }], links: [] },
  tigergraph: { queryName: "q", ms: 12 }, model: { name: "m" }, explanation: { en: "Be careful.", hi: "सावधान।" },
  limitations: [], creditsRemaining, engine: "networkx",
});

async function newPage(browser, state) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // demo mode lets the visitor into the app shell without a sign-in
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("finpilot:demo_mode", "1");
      localStorage.setItem("finpilot:onboarded", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/crypto/credits") return json(route, { balance: state.balance, packs: [{ id: "p1", credits: 50, priceUsd: 5, label: "Starter" }] });
    if (p === "/api/crypto/status" || p === "/api/crypto/health") return json(route, { ok: true, voiceProvider: "sarvam", engine: "networkx", engineOk: true, mocks: false });
    if (p === "/api/crypto/demo-wallets") return json(route, { wallets: [{ address: ADDR, note: "Borderline test-split wallet", expected: "WARN" }] });
    if (p === "/api/crypto/check/stream") return json(route, { error: "nope" }, 404);
    if (p === "/api/crypto/check") {
      const { address } = JSON.parse(route.request().postData() ?? "{}");
      state.checks.push(address);
      state.balance -= 1;
      return json(route, checkBody(address, state.balance));
    }
    if (p === "/api/crypto/checkout") return json(route, { url: "https://test.checkout.dodopayments.com/session/abc" });
    if (p === "/api/chat") { state.chats.push(route.request().postData()); return json(route, { detail: "offline" }, 503); }
    return route.continue(); // backend is not running: the app shows its normal empty/error states
  });
  // the Dodo page never answers: the tab stays on our page in the "redirecting" state, like a slow navigation
  await page.route("https://test.checkout.dodopayments.com/**", () => {});
  return page;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("BUG-101: the pill refreshes after an uncached check (no reload)", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/wallet-guard`);
  await page.getByRole("button", { name: "100 credits" }).waitFor();
  await page.fill("#wg-address", ADDR);
  await page.click("#wg-submit");
  await page.getByRole("button", { name: "99 credits" }).waitFor({ timeout: 10000 });
  assert.equal(state.checks.length, 1);
});

test("BUG-006: run=1 deep link never spends a credit; an already-checked address shows free", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/wallet-guard?address=${ADDR}&run=1`);
  await page.waitForTimeout(1500);
  assert.equal(await page.inputValue("#wg-address"), ADDR);
  assert.equal(state.checks.length, 0, "hostile link must not run a billable check");
  // check from Copilot (1 credit), follow the card's link: client navigation, result shown, still 1 check
  await page.goto(`${BASE}/copilot`);
  const box = page.locator("textarea");
  await box.fill(`Is this wallet safe to pay? ${ADDR}`);
  await box.press("Enter");
  await page.getByRole("link", { name: /open|full|details/i }).first().waitFor({ timeout: 15000 });
  assert.equal(state.checks.length, 1);
  await page.getByRole("link", { name: /open|full|details/i }).first().click();
  await page.waitForURL(/wallet-guard/);
  await page.waitForTimeout(1500);
  assert.equal(state.checks.length, 1, "deep link after a check is a free, remembered result");
  assert.ok(await page.getByText("Two hops from an illicit wallet").first().isVisible());
});

test("BUG-102: space/hyphen split keys never reach /api/chat", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/copilot`);
  const box = page.locator("textarea");
  for (const text of [HEX.match(/.{8}/g).join(" "), HEX.match(/.{8}/g).join("-"), `my key ${HEX.slice(0, 30)} ${HEX.slice(30)}`]) {
    await box.fill(text);
    await box.press("Enter");
    await page.waitForTimeout(300);
    assert.equal(await box.inputValue(), "", "input wiped");
  }
  assert.equal(state.chats.length, 0);
  assert.ok(await page.getByRole("alert").filter({ hasText: /seed phrase|private key/i }).first().isVisible());
});

test("BUG-103: two addresses give two cards", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/copilot`);
  const box = page.locator("textarea");
  await box.fill(`compare ${ADDR} and ${OLD}`);
  await box.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0 && document.body.innerText.includes("Wallet check"), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.deepEqual([...state.checks].sort(), [ADDR, OLD].sort());
});

test("BUG-026/069/070: pill is >= 44px, label contains the visible number, Escape returns focus", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/wallet-guard`);
  const pill = page.getByRole("button", { name: "100 credits" });
  await pill.waitFor();
  const b = await pill.boundingBox();
  assert.ok(b.height >= 44 && b.width >= 44, `pill is ${b.width}x${b.height}`);
  await pill.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "100 credits");
});

test("BUG-004/106: no hard-coded TigerGraph/Wispr; engine comes from /status; WARN chip says Warn", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/copilot`);
  await page.getByTestId("crypto-status").waitFor();
  const text = await page.locator("body").innerText();
  assert.match(await page.getByTestId("crypto-status").innerText(), /Graph engine: NetworkX/);
  assert.doesNotMatch(text, /TigerGraph|Wispr/);
  await page.goto(`${BASE}/wallet-guard`);
  await page.getByRole("button", { name: /warn/i }).first().waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /Borderline test-split/);
});

test("BUG-030: the Dodo pay button resets on a bfcache pageshow", async (browser) => {
  const state = { balance: 100, checks: [], chats: [] };
  const page = await newPage(browser, state);
  await page.goto(`${BASE}/credits`);
  const pay = page.getByRole("button", { name: /Pay by card|Opening Dodo/ });
  await pay.waitFor();
  await pay.click({ noWaitAfter: true });
  await page.waitForFunction(() => /Opening Dodo/.test([...document.querySelectorAll("button")].map((x) => x.textContent).join("|")), null, { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForFunction(() => /Pay by card/.test([...document.querySelectorAll("button")].map((x) => x.textContent).join("|")), null, { timeout: 5000 });
});
  assert.ok(await page.getByRole("button", { name: /Pay by card/ }).isEnabled());
});

const browser = await chromium.launch();
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn(browser);
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n").slice(0, 4).join("\n     ")}`);
  }
}
await browser.close();
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
