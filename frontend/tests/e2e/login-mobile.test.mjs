// BUG-025: /login must not overflow at 360 and 390 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch, open, overflowing } from "./helpers.mjs";

test("login has no horizontal overflow at 360/390", async (t) => {
  const browser = await launch();
  if (!browser) return t.skip("no E2E_BASE_URL or playwright");
  try {
    for (const w of [360, 390]) {
      const { ctx, page } = await open(browser, "/login", w);
      assert.deepEqual(await overflowing(page), [], `width ${w}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});
