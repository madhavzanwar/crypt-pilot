// BUG-003 regression: switching to Hindi must not change the SHA-256 shown on /statement.
// Usage: BASE=http://localhost:3230 node tests/statement-hash-hi.pw.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("/home/user/cryptiq/frontend/node_modules/playwright");
const BASE = process.env.BASE || "http://localhost:3230";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("finpilot_lang", "en");
    localStorage.setItem("finpilot:demo_mode", "1");
    localStorage.setItem("finpilot:user_id", "demo-priya");
  });
  await page.goto(`${BASE}/statement`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const sel = "dd[translate=no]";
  await page.waitForSelector(sel, { timeout: 60000 });
  const hashRe = /0x[0-9a-f]{64}/;
  const en = (await page.locator(sel).first().innerText()).trim();
  if (!hashRe.test(en)) throw new Error("no English hash: " + en);
  await page.evaluate(() => { localStorage.setItem("finpilot_lang", "hi"); window.dispatchEvent(new StorageEvent("storage", { key: "finpilot_lang" })); });
  await page.selectOption("header select", "hi").catch(() => {});
  await page.waitForTimeout(4000);
  const hi = (await page.locator(sel).first().innerText()).trim();
  const pan = await page.locator("text=AADPS").first().innerText().catch(() => "");
  const devanagariDigits = /[०-९]/;
  const hindiActive = devanagariDigits.test(await page.locator("body").innerText());
  console.log({ en, hi, hindiActive, pan });
  if (en !== hi) throw new Error(`hash changed in Hindi: ${en} -> ${hi}`);
  if (/[०-९]/.test(hi)) throw new Error("Devanagari digits in hash");
  if (pan && !/AADPS9102K/.test(pan)) throw new Error("PAN altered: " + pan);
  if (!hindiActive) throw new Error("Hindi mode did not activate (test inconclusive)");
  await browser.close();
  console.log("PASS");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
