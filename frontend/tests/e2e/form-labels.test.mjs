// BUG-026: every visible form control on these pages has an accessible name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch, open } from "./helpers.mjs";

const PAGES = ["/photos", "/tax", "/household", "/transactions", "/upload", "/budgets"];

test("form controls have accessible names", async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no E2E_BASE_URL or playwright");
  try {
    for (const path of PAGES) {
      const { ctx, page } = await open(browser, "/login", 1360);
      await page.evaluate(() => {
        localStorage.setItem("finpilot:demo_mode", "1");
        localStorage.setItem("finpilot:user_id", "demo-priya");
      });
      await page.goto(new URL(path, page.url()).href, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll("input,select,textarea")]
          .filter((e) => e.type !== "hidden")
          .filter((e) => !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e.labels && e.labels.length) || e.title))
          .map((e) => `${e.tagName}[${e.type}] ${e.getAttribute("placeholder") || ""}`),
      );
      assert.deepEqual(bad, [], path);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});
