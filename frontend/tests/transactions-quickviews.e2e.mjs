// Regression for QA-1: every Quick view / filter / sort / pagination control on /transactions must not crash the page.
// Usage: BASE_URL=http://localhost:3750 node tests/transactions-quickviews.e2e.mjs
import { open } from "./_pw.mjs";

const { browser, page } = await open("/transactions");
const crashed = async () => (await page.getByText("Something went wrong").count()) > 0;
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
let n = 0;
const check = async (what) => {
  await page.waitForTimeout(250);
  n++;
  if (await crashed()) { console.error("FAIL: crash after", what); await browser.close(); process.exit(1); }
};

for (const label of ["Quick views", "Filters", "Date", "Search"]) {
  await page.getByRole("button", { name: label, exact: true }).first().click(); await check(`open ${label}`);
}
await page.getByRole("button", { name: "Quick views", exact: true }).first().click();
for (const q of ["All Transactions", "Pending Review", "Subscriptions", "High Value", "Inflow", "Dining", "Groceries", "High Value", "High Value", "All Transactions"]) {
  await page.getByRole("button", { name: q, exact: true }).first().click(); await check(`quick view ${q}`);
}
await page.getByRole("button", { name: "Filters", exact: true }).first().click();
const selects = page.locator("select:visible");
for (let i = 0; i < (await selects.count()); i++) {
  const opts = await selects.nth(i).locator("option").evaluateAll((os) => os.map((o) => o.value));
  for (const v of opts) { await selects.nth(i).selectOption(v); await check(`select ${i}=${v}`); }
  await selects.nth(i).selectOption(opts[0]);
}
for (const h of ["Date", "Merchant", "Category", "Amount"]) {
  const th = page.getByRole("table").getByRole("button", { name: h }).first();
  if (await th.count()) { await th.click(); await check(`sort ${h}`); await th.click(); await check(`sort ${h} desc`); }
}
for (const t of ["Next", "Previous"]) {
  const b = page.getByRole("button", { name: new RegExp(t, "i") }).first();
  if (await b.count() && (await b.isEnabled())) { await b.click(); await check(t); }
}
await page.getByRole("button", { name: "Quick views", exact: true }).first().click();
await page.getByRole("button", { name: "High Value", exact: true }).first().click();
await check("high value final");
if (errs.some((e) => /Maximum call stack/.test(e))) { console.error("FAIL: stack overflow", errs); process.exit(1); }
console.log(`OK: ${n} interactions, no crash`);
await browser.close();
