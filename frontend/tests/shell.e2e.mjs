// QA4-3 / QA4-5: Escape closes the mobile drawer from the logo link; one skip link; sidebar, title and palette are
// translated (hi); palette lists the crypto pages; privacy mode removes amounts from the DOM.
// Run: BASE_URL=http://localhost:3730 node tests/shell.e2e.mjs
import assert from "node:assert/strict";
import { open } from "./_pw.mjs";

{
  const { browser, page } = await open("/dashboard", { w: 390, h: 800 });
  await page.getByRole("button", { name: /Toggle Sidebar/i }).first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")), "/");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.querySelector("[role=dialog]")?.getAttribute("data-state") || "none"), "none");
  await browser.close();
}
{
  const { browser, page } = await open("/forecast-risk", { lang: "hi" });
  assert.equal(await page.locator('a[href="#main-content"]').count(), 1, "exactly one skip link");
  const side = await page.locator("[data-sidebar=sidebar]").first().innerText();
  for (const en of ["Forecast & Risk", "Simulate", "Evidence Council", "Risk Council", "Twin Simulator", "More"])
    assert.ok(!side.includes(en), `sidebar still has English "${en}"`);
  assert.ok(!(await page.locator("header").first().innerText()).includes("Forecast & Risk"), "title translated");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  const dlg = await page.locator("[role=dialog]").innerText();
  for (const en of ["Navigation & Views", "Quick Actions", "Dashboard", "Wallet Guard", "Credits"]) assert.ok(!dlg.includes(en), `palette has English "${en}"`);
  await page.keyboard.type("वॉलेट");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForURL(/wallet-guard/, { timeout: 45000 });
  await browser.close();
}
{
  const { browser, page } = await open("/dashboard");
  await page.getByRole("button", { name: /Hide amounts/i }).click();
  await page.waitForTimeout(800);
  const text = await page.locator("main").innerText();
  assert.ok(!/₹\s?\d/.test(text), "no rupee amounts left in main while masked");
  await page.getByRole("button", { name: /Show amounts/i }).click();
  await page.waitForTimeout(500);
  assert.ok(/₹\s?\d/.test(await page.locator("main").innerText()), "amounts restored");
  await browser.close();
}
console.log("shell e2e ok");
