// QA-C browser check. Run: BASE=http://localhost:3720 node tests/e2e/qa-c.e2e.mjs  (needs a running web + API)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/home/user/cryptiq/frontend/node_modules/playwright");
const BASE = process.env.BASE || "http://localhost:3720";
const browser = await chromium.launch();
const page = await browser.newPage();
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); if (!ok) fails++; };

await page.goto(`${BASE}/login`);
check("login title", (await page.title()) === "Sign in | CryptPilot", await page.title());
await page.getByText("Explore Demo App").click();
await page.waitForURL(/dashboard/, { timeout: 30000 });
const titles = { dashboard: "Dashboard", "forecast-risk": "Forecast & Risk", twin: "Twin Simulator", "my-data": "My Data", "evidence-room": "Evidence Room", scenarios: "Scenarios" };
for (const [r, t] of Object.entries(titles)) {
  await page.goto(`${BASE}/${r}`);
  await page.waitForTimeout(1500);
  check(`title ${r}`, (await page.title()) === `${t} | CryptPilot`, await page.title());
}
for (const r of ["twin", "my-data", "evidence-room"]) {
  await page.goto(`${BASE}/${r}`);
  await page.waitForTimeout(1500);
  check(`h1 ${r}`, (await page.locator("h1").count()) >= 1);
}
await page.goto(`${BASE}/pay`);
check("h1 pay", (await page.locator("h1").count()) >= 1);

// forecast validation
await page.goto(`${BASE}/forecast-risk`);
await page.waitForSelector("text=Apply and re-run", { timeout: 30000 });
check("seed default", (await page.getByLabel("Random seed").inputValue()) === "20240601");
await page.getByLabel("Cash reserve (INR)").fill("-100");
await page.getByLabel("Goal by month #").fill("99");
await page.getByText("Apply and re-run").click();
const body = await page.locator("body").innerText();
check("forecast inline errors", /Cash reserve must be at least 0/.test(body) && /Goal month must be at most 60/.test(body));
check("no raw api text", !/api\/forecast|"detail"|failed: 422/.test(body));

// twin validation
await page.goto(`${BASE}/twin`);
await page.getByLabel("Merchant name").fill("");
await page.getByLabel("Amount in rupees").fill("-5");
await page.getByText("Run the agents").click();
const tb = await page.locator("body").innerText();
check("twin inline errors", /Merchant name is required/.test(tb) && /Amount must be greater than 0/.test(tb));

// timeline validation
await page.goto(`${BASE}/scenarios?tab=timeline`);
await page.getByText("Add and recompute").click();
const sb = await page.locator("body").innerText();
check("timeline inline error", /Description is required/.test(sb));
await browser.close();
process.exit(fails ? 1 : 0);
