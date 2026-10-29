// BUG-032: unknown routes render the app's own 404 with an h1, not the bare Next page; BUG-029 robots/sitemap exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch, open, BASE } from "./helpers.mjs";

test("custom 404, robots and sitemap", async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no E2E_BASE_URL or playwright");
  try {
    const { ctx, page } = await open(browser, "/definitely-not-a-page", 1360);
    assert.equal(await page.locator("h1").innerText(), "Page not found");
    await ctx.close();
    assert.equal((await fetch(BASE + "/robots.txt")).status, 200);
    assert.equal((await fetch(BASE + "/sitemap.xml")).status, 200);
  } finally {
    await browser.close();
  }
});
