// Real-backend integration check (no mocks). Needs backend (FINPILOT_DEMO_MODE=true) behind the frontend's BACKEND_URL.
//   BASE=http://localhost:3771 API=http://127.0.0.1:8771 node tests/shared-delete.real.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(process.env.PW_FROM ?? "/opt/node-tools/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3771", API = process.env.API ?? "http://127.0.0.1:8771";
const G = "guest-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
const post = (p, b) => fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
assert.equal((await post(`/api/household/${G}`, { name: "Real Fam" })).status, 200);
assert.equal((await post(`/api/household/${G}/managed-members`, { name: "Nani", relationship: "parent" })).status, 200);

const browser = await chromium.launch();
const open = async (persona, path) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript((p) => { try { localStorage.setItem("finpilot:demo_mode", "1"); localStorage.setItem("finpilot:onboarded", "1"); localStorage.setItem("finpilot:user_id", p); } catch {} }, persona);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
  return { ctx, page };
};
try {
  let { ctx, page } = await open(G, "/household");
  let card = page.getByTestId("shared-expenses");
  await card.waitFor();
  await card.getByText("All settled").waitFor();
  await card.getByLabel("What was it for?").fill("Groceries");
  await card.getByLabel("Amount").fill("900");
  await card.getByRole("button", { name: "Add expense" }).click();
  await card.getByTestId("expense-list").getByText("Groceries").waitFor();
  const t = await card.getByTestId("transfers").innerText();
  console.log("transfers:", t.replace(/\n/g, " | "));
  assert.match(t, /Nani owes .* ₹450/);
  await card.getByRole("button", { name: /Settle up: Nani/ }).click();
  await card.getByTestId("settlement-list").waitFor();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: /Delete: Groceries/ }).click();
  await card.getByText("No shared expenses yet").waitFor();
  console.log("ok guest household add/settle/delete against real API");
  await ctx.close();

  ({ ctx, page } = await open("demo-priya", "/household"));
  card = page.getByTestId("shared-expenses");
  await card.getByText("Sample data", { exact: true }).waitFor();
  assert.equal(await card.locator("form").count(), 0);
  console.log("ok demo household is sample/read-only");
  await ctx.close();

  ({ ctx, page } = await open("demo-priya", "/my-data"));
  assert.ok(await page.getByTestId("open-delete").isDisabled());
  await ctx.close();
  ({ ctx, page } = await open(G, "/my-data"));
  await page.getByTestId("open-delete").click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByTestId("confirm-delete").click();
  await page.waitForURL("**/dashboard");
  const after = await (await fetch(`${API}/api/household/${G}/shared-expenses`)).json();
  assert.equal(after, null);
  console.log("ok delete my data against real API; household gone");
  await ctx.close();
} finally { await browser.close(); }
