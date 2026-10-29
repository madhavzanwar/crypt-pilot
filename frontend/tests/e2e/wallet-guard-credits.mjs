// Playwright check for BUG-006 / BUG-101. Run: BASE=http://127.0.0.1:3210 node tests/e2e/wallet-guard-credits.mjs
// Needs the web app on BASE and the FinPilot + crypto services behind it. It spends credits of a fresh demo session only.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("/home/user/cryptiq/frontend/node_modules/playwright");

const BASE = process.env.BASE || "http://127.0.0.1:3210";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${extra}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const checks = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/crypto\/check/.test(r.url())) checks.push(r.url());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Explore Demo App").click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  const credits = async () => (await (await page.request.get(`${BASE}/api/crypto/credits`)).json()).balance;
  const wallets = await (await page.request.get(`${BASE}/api/crypto/demo-wallets`)).json();
  const list = wallets.wallets || wallets;
  const addr = (list.find((w) => w.expected !== "UNKNOWN") || list[0]).address; // an UNKNOWN wallet is free, so it would prove nothing
  const before = await credits();

  // (a) a crafted link must only prefill
  await page.goto(`${BASE}/wallet-guard?address=${encodeURIComponent(addr)}&run=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  ok("crafted run=1 link sends no check", checks.length === 0, `requests=${checks.length}`);
  ok("crafted link prefills the address", (await page.inputValue("#wg-address")) === addr);
  ok("crafted link spends no credit", (await credits()) === before, `${before} -> ${await credits()}`);

  // (b) a click runs exactly one check, and the pill follows the balance (BUG-101)
  await page.click("#wg-submit");
  await page.waitForSelector('[data-testid="credits-left"]', { timeout: 40000 });
  const after = await credits();
  ok("one click = one check request", checks.length === 1, `requests=${checks.length}`);
  await page.waitForTimeout(1500);
  const pill = (await page.locator('button[aria-label$="Open credits"] .tabular-nums').first().innerText()).trim();
  ok("header pill shows the new balance", pill === String(after), `pill=${pill} balance=${after} (was ${before})`);

  // (c) switching language must not start a second check
  const n = checks.length;
  await page.selectOption("select[aria-label]", "hi");
  await page.waitForTimeout(3000);
  await page.selectOption("select[aria-label]", "mr");
  await page.waitForTimeout(3000);
  ok("language switch sends no new check", checks.length === n, `requests=${checks.length}`);
  ok("language switch spends no credit", (await credits()) === after);

  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
