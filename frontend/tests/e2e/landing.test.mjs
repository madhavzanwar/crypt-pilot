// BUG-004 / BUG-092: landing makes no unconditional TigerGraph/Wispr claim and has no <a><button>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch, open } from "./helpers.mjs";

test("landing claims are conditional and no nested interactive", async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no E2E_BASE_URL or playwright");
  try {
    const { ctx, page } = await open(browser, "/", 1360);
    assert.equal(await page.locator("a button, a a").count(), 0);
    const items = await page.locator("section ul li").allInnerTexts();
    for (const it of items.filter((x) => /TigerGraph|Wispr/.test(x))) {
      assert.match(it, /when configured|optional/i, it);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
});
