// Integration pass: Timeline what-if note, secret_input message, dashboard month after a far-future event is rejected,
// Forecast & Risk single validation, per-route titles and a translated top-bar title.
// Run: BASE_URL=http://127.0.0.1:3740 API_URL=http://127.0.0.1:8740 node tests/integration.e2e.mjs
import assert from "node:assert/strict";
import { open } from "./_pw.mjs";

const API = process.env.API_URL ?? "http://127.0.0.1:8740";
const monthName = new Date().toLocaleDateString("en", { month: "long", year: "numeric" });

// 1. Timeline: a demo persona gets a what-if answer, never "added / completed".
{
  const { browser, page } = await open("/scenarios?tab=timeline");
  await page.getByPlaceholder(/Health insurance premium/i).fill("Integration what-if");
  await page.getByRole("button", { name: /Add and recompute/i }).click();
  await page.getByTestId("whatif-note").waitFor({ timeout: 30000 });
  assert.match(await page.getByTestId("whatif-note").innerText(), /What-if only: nothing was saved/);
  const body = await page.locator("main").innerText();
  assert.equal((body.match(/nothing was saved/gi) ?? []).length, 1, "the what-if note is shown once");
  assert.ok(!/completed|transaction added/i.test(body), "not described as an added transaction");
  await browser.close();
}

// 2. A far-future event is rejected by the API and the dashboard stays on the current month.
{
  const r = await fetch(`${API}/api/events/demo-priya`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "transaction", merchant: "Far", amount: -1000, date: "2099-01-01" }) });
  assert.equal(r.status, 422);
  const { browser, page } = await open("/dashboard");
  const main = await page.locator("main").innerText();
  assert.ok(!/2099/.test(main), "no 2099 on the dashboard");
  assert.ok(main.includes(monthName), `the current month is shown (${monthName})`);
  await browser.close();
}

// 3. secret_input: the API refuses, and the popup/page show the server's friendly detail without echoing the text.
{
  const r = await fetch(`${API}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", user_id: "demo-priya" }) });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.error, "secret_input");
  const detail = "This looks like a seed phrase or a private key. Never share it with anyone, including this chat. (server detail)";
  const { browser, page } = await open("/copilot");
  await page.route("**/api/chat", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "secret_input", detail }) }));
  await page.getByRole("textbox").first().fill("what is my safe to spend this week");
  await page.keyboard.press("Enter");
  await page.getByText("(server detail)").first().waitFor({ timeout: 20000 });
  const text = await page.locator("main").innerText();
  assert.ok(!/Could not reach FinPilot/.test(text), "not shown as a connection failure");
  await browser.close();
}

// 4. Forecast & Risk: one inline message per invalid field; titles per route; translated top-bar title.
{
  const { browser, page } = await open("/forecast-risk");
  await page.getByLabel(/Cash reserve/i).fill("-100");
  await page.getByRole("button", { name: /Apply and re-run/i }).click();
  await page.waitForTimeout(500);
  const alerts = await page.getByRole("alert").allInnerTexts();
  assert.equal(alerts.filter((a) => /reserve/i.test(a)).length, 1, `one reserve message, got ${JSON.stringify(alerts)}`);
  assert.ok(!(await page.locator("main").innerText()).includes("failed: 4"), "no raw API text");
  await browser.close();
}
for (const [path, title] of [["/copilot", "Copilot"], ["/council", "Risk Council"], ["/wallet-guard", "Wallet Guard"], ["/credits", "Credits"]]) {
  const { browser, page } = await open(path);
  assert.match(await page.title(), new RegExp(`^${title}`), `${path} title`);
  await browser.close();
}
{
  const { browser, page } = await open("/council", { lang: "hi" });
  assert.ok(!(await page.locator("header").first().innerText()).includes("Risk Council"), "top-bar title translated (hi)");
  await browser.close();
}
console.log("integration.e2e: all checks passed");
