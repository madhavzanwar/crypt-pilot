// QA4-4: landing header fully visible (Sign in not clipped) at phone widths; "Learn more" are real links.
// Run: BASE_URL=http://localhost:3730 node tests/landing.e2e.mjs
import assert from "node:assert/strict";
import { chromium, BASE } from "./_pw.mjs";

const browser = await chromium.launch();
for (const w of [320, 360, 390, 414]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 800 } })).newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const h = document.querySelector("header");
    const btn = [...h.querySelectorAll("a,button")].find((e) => /sign in/i.test(e.textContent || ""));
    const b = btn?.getBoundingClientRect();
    return { right: b?.right, width: innerWidth, found: !!btn };
  });
  assert.ok(r.found, `${w}: sign in present`);
  assert.ok(r.right <= r.width + 0.5, `${w}: Sign in right edge ${r.right} fits in ${r.width}`);
  if (w === 390) {
    const dead = await page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.textContent?.trim() === "Learn more" && !s.closest("a")).length);
    assert.equal(dead, 0, "no dead Learn more spans");
  }
  await page.close();
}
await browser.close();
console.log("landing e2e ok");
