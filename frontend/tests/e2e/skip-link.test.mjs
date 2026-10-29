// BUG-026: a skip link is the first tab stop and moves focus into <main>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch, open } from "./helpers.mjs";

test("skip link focuses main", async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no E2E_BASE_URL or playwright");
  try {
    const { ctx, page } = await open(browser, "/login", 1360);
    await page.evaluate(() => { localStorage.setItem("finpilot:demo_mode", "1"); });
    await page.goto(new URL("/wallet-guard", page.url()).href, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert.match(first ?? "", /Skip to main content/);
    await page.keyboard.press("Enter");
    const inMain = await page.evaluate(() => !!document.activeElement?.closest("main") || document.activeElement?.tagName === "MAIN");
    assert.ok(inMain);
    await ctx.close();
  } finally {
    await browser.close();
  }
});
