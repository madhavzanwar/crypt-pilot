// Playwright checks for "Delete my data" (/my-data) and "Who owes who" (/household) with every /api call mocked in the
// browser. The real backend is NOT involved, so this verifies the UI against the contract only.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers BASE=http://localhost:3770 node tests/shared-delete.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(process.env.PW_FROM ?? "/opt/node-tools/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3770";

const M = [
  { id: "u-priya", name: "Priya", kind: "user" },
  { id: "u-rishi", name: "Rishi", kind: "user" },
  { id: "m-nani", name: "Nani", kind: "managed" },
];
const summary = (over = {}) => ({
  household_id: "h1", sample: false, read_only: false, members: M,
  expenses: [{ id: "e1", title: "Groceries", amount: 900, paid_by: "u-priya", split_among: ["u-priya", "u-rishi", "m-nani"], category: "Food", date: "2026-10-28", created_by: "u-priya", created_at: "2026-10-28T10:00:00Z" }],
  settlements: [],
  balances: [
    { member_id: "u-priya", name: "Priya", paid: 900, owed: 300, net: 600 },
    { member_id: "u-rishi", name: "Rishi", paid: 0, owed: 300, net: -300 },
    { member_id: "m-nani", name: "Nani", paid: 0, owed: 300, net: -300 },
  ],
  transfers: [{ from: "u-rishi", to: "u-priya", amount: 300 }, { from: "m-nani", to: "u-priya", amount: 300 }],
  ...over,
});
const hh = {
  household: { id: "h1", name: "Test Family", owner_user_id: "u1", created_at: "2026-01-01T00:00:00Z" },
  members: M.map((m, i) => ({ id: `r${i}`, household_id: "h1", user_id: m.id, role: i ? "editor" : "owner", joined_at: "2026-01-01T00:00:00Z", display_name: m.name, avatar_letter: m.name[0], net_worth: 0 })),
  invites: [], net_worth_summary: { total_net_worth: 0, total_assets: 0, total_liabilities: 0, members_breakdown: [] }, user_role: "owner",
};
const myData = { sources: [], access_log: [] };

/** Mock the API. `state.shared` is what GET/POST return; requests are recorded in `calls`. */
async function setup(browser, { persona, width = 1366, state }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((p) => {
    try {
      localStorage.setItem("finpilot:demo_mode", "1");
      localStorage.setItem("finpilot:onboarded", "1");
      localStorage.setItem("finpilot:user_id", p);
    } catch {}
  }, persona);
  const calls = [];
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (/\/shared-expenses$/.test(path) && req.method() === "GET") return json(200, state.shared);
    if (/\/shared-expenses$/.test(path) && req.method() === "POST") {
      const body = req.postDataJSON();
      calls.push({ m: "POST", path, body });
      state.shared = summary({ expenses: [...state.shared.expenses, { id: "e2", ...body, created_by: "u-priya", created_at: "2026-10-30T10:00:00Z" }] });
      return json(201, state.shared);
    }
    if (/\/shared-expenses\/[^/]+$/.test(path) && req.method() === "DELETE") {
      calls.push({ m: "DELETE", path });
      state.shared = summary({ expenses: [], transfers: [], balances: state.shared.balances.map((b) => ({ ...b, paid: 0, owed: 0, net: 0 })) });
      return json(200, state.shared);
    }
    if (/\/settlements$/.test(path) && req.method() === "POST") {
      const body = req.postDataJSON();
      calls.push({ m: "POST", path, body });
      state.shared = summary({ transfers: state.shared.transfers.slice(1), settlements: [{ id: "s1", ...body, date: "2026-10-30", note: null }] });
      return json(201, state.shared);
    }
    if (/\/my-data\/[^/]+\/delete$/.test(path)) {
      calls.push({ m: "POST", path, body: req.postDataJSON() });
      return state.deleteStatus === 403 ? json(403, { detail: "Demo data is shared." }) : json(200, { deleted: { transactions: 12, goals: 2 }, total: 14, kept: ["Firebase sign-in account"], at: "2026-10-30T10:00:00Z" });
    }
    if (/\/api\/my-data\/[^/]+$/.test(path)) return json(200, myData);
    if (/\/api\/household\/[^/]+$/.test(path) && req.method() === "GET") return json(200, hh);
    return json(404, { detail: "not mocked" });
  });
  const page = await ctx.newPage();
  return { ctx, page, calls };
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const browser = await chromium.launch();
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);
try {
  // ---- Delete my data: real (non-demo) user ----
  {
    const { ctx, page, calls } = await setup(browser, { persona: "guest-abcdef012345", state: { shared: null } });
    await page.goto(`${BASE}/my-data`, { waitUntil: "networkidle" });
    await page.getByTestId("danger-zone").waitFor();
    const text = await page.getByTestId("danger-zone").innerText();
    assert.match(text, /What is deleted/); assert.match(text, /What is not deleted/); assert.match(text, /Download my data first/);
    ok("danger zone explains deleted / kept and links the export");
    await page.getByTestId("open-delete").click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    const confirm = page.getByTestId("confirm-delete");
    assert.ok(await confirm.isDisabled());
    for (const v of ["delete", "Delete", "DELET"]) { await page.getByLabel("Type DELETE to confirm").fill(v); assert.ok(await confirm.isDisabled(), v); }
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    assert.ok(await confirm.isEnabled());
    ok("final button disabled until exact DELETE typed");
    await confirm.click();
    await page.waitForURL("**/dashboard");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/my-data/guest-abcdef012345/delete");
    assert.deepEqual(calls[0].body, { confirm: "DELETE MY DATA" });
    ok("POST body is {confirm:'DELETE MY DATA'} and success navigates to /dashboard");
    await ctx.close();
  }
  // ---- Delete my data: demo persona ----
  {
    const { ctx, page, calls } = await setup(browser, { persona: "demo-priya", state: { shared: null } });
    await page.goto(`${BASE}/my-data`, { waitUntil: "networkidle" });
    await page.getByTestId("danger-zone").waitFor();
    assert.ok(await page.getByTestId("open-delete").isDisabled());
    assert.match(await page.getByTestId("demo-note").innerText(), /Demo data is shared and cannot be deleted\. Sign in with your own account to use this\./);
    assert.equal(calls.length, 0);
    ok("demo persona: delete button disabled with explanation");
    await ctx.close();
  }
  // ---- Delete error is friendly ----
  {
    const { ctx, page } = await setup(browser, { persona: "guest-abcdef012345", state: { shared: null, deleteStatus: 403 } });
    await page.goto(`${BASE}/my-data`, { waitUntil: "networkidle" });
    await page.getByTestId("open-delete").click();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByTestId("confirm-delete").click();
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert.ok(page.url().includes("/my-data"));
    ok("failed delete shows an error in the dialog and stays on the page");
    await ctx.close();
  }
  // ---- Shared expenses: add / settle / delete ----
  {
    const state = { shared: summary() };
    const { ctx, page, calls } = await setup(browser, { persona: "guest-abcdef012345", state });
    await page.goto(`${BASE}/household`, { waitUntil: "networkidle" });
    const card = page.getByTestId("shared-expenses");
    await card.waitFor();
    assert.match(await card.getByTestId("transfers").innerText(), /Rishi owes Priya ₹300/);
    assert.equal(await card.getByTestId("balance-chip").count(), 3);
    ok("transfers and balance chips render with formatted money");
    await card.getByRole("button", { name: "Add expense" }).click();
    assert.ok((await card.getByRole("alert").count()) >= 2);
    assert.equal(calls.length, 0);
    ok("inline validation blocks an empty submit");
    await card.getByLabel("What was it for?").fill("Milk");
    await card.getByLabel("Amount").fill("60");
    await card.getByRole("checkbox", { name: "Nani" }).uncheck();
    await card.getByRole("button", { name: "Add expense" }).click();
    await card.getByText("Milk").waitFor();
    const add = calls.find((c) => c.m === "POST" && c.path.endsWith("/shared-expenses"));
    assert.equal(add.body.title, "Milk"); assert.equal(add.body.amount, 60); assert.deepEqual(add.body.split_among, ["u-priya", "u-rishi"]);
    assert.equal(add.body.category, null); assert.match(add.body.date, /^\d{4}-\d{2}-\d{2}$/);
    ok("add expense sends contract body");
    await card.getByRole("button", { name: /Settle up: Rishi/ }).click();
    await card.getByTestId("settlement-list").waitFor();
    const st = calls.find((c) => c.path.endsWith("/settlements"));
    assert.deepEqual({ from: st.body.from, to: st.body.to, amount: st.body.amount }, { from: "u-rishi", to: "u-priya", amount: 300 });
    ok("settle up posts the suggested transfer and shows history");
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: /Delete: Groceries/ }).click();
    await card.getByText("All settled").waitFor();
    assert.ok(calls.some((c) => c.m === "DELETE" && c.path.endsWith("/shared-expenses/e1")));
    ok("delete expense (after confirm) and 'All settled' empty state");
    await ctx.close();
  }
  // ---- Sample / read-only ----
  {
    const { ctx, page } = await setup(browser, { persona: "demo-priya", state: { shared: summary({ sample: true, read_only: true }) } });
    await page.goto(`${BASE}/household`, { waitUntil: "networkidle" });
    const card = page.getByTestId("shared-expenses");
    await card.getByText("Sample data", { exact: true }).waitFor();
    assert.match(await card.getByTestId("sample-note").innerText(), /Create your own household or sign in to track real expenses/);
    assert.equal(await card.getByRole("button").count(), 0);
    assert.equal(await card.locator("form").count(), 0);
    ok("sample/read-only: badge + explanation, no write controls");
    await ctx.close();
  }
  // ---- No household ----
  {
    const { ctx, page } = await setup(browser, { persona: "guest-abcdef012345", state: { shared: null } });
    await page.goto(`${BASE}/household`, { waitUntil: "networkidle" });
    const card = page.getByTestId("shared-expenses");
    await card.getByText("No household yet").waitFor();
    assert.ok(await card.getByRole("link", { name: "Create a household" }).isVisible());
    ok("no household: empty state with create link");
    await ctx.close();
  }
  // ---- Layouts ----
  for (const width of [390, 1366]) {
    for (const [path, state] of [["/household", { shared: summary() }], ["/my-data", { shared: null }]]) {
      const { ctx, page } = await setup(browser, { persona: "guest-abcdef012345", width, state });
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      assert.ok((await overflow(page)) <= 1, `${path} overflows at ${width}`);
      if (path === "/my-data") { await page.getByTestId("open-delete").click(); await page.getByRole("dialog").waitFor(); assert.ok((await overflow(page)) <= 1, `dialog overflow ${width}`); }
      await ctx.close();
      ok(`${path} no horizontal overflow at ${width}px`);
    }
  }
} finally {
  await browser.close();
}
console.log(`all ${n} checks passed (mocked API only)`);
