// BUG-003 / BUG-040 / BUG-041: statement hash stays ascii in Hindi, matches sha256sum, period derived from data.
// Run: node tests/statement.e2e.mjs   (frontend on :3400 with backend)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { open } from "./_pw.mjs";

for (const lang of ["en", "hi", "mr"]) {
  const { browser, page } = await open("/statement", { lang });
  await page.waitForSelector('[data-testid="statement-hash"]', { timeout: 20000 });
  await page.waitForTimeout(2500); // let AutoTranslate run
  const hash = (await page.textContent('[data-testid="statement-hash"]')).trim();
  const docHash = (await page.textContent('[data-testid="statement-doc-hash"]')).trim();
  assert.match(hash, /^0x[0-9a-f]{64}$/, `${lang}: anchor hash is plain ascii hex, got ${hash}`);
  assert.match(docHash, /^[0-9a-f]{64}$/, `${lang}: document hash is plain ascii hex, got ${docHash}`);
  assert.equal(hash, `0x${docHash}`);
  await page.locator("summary").filter({ hasText: /./ }).first().click().catch(() => {});
  const canonical = await page.locator("pre.notranslate").first().evaluate((e) => e.textContent);
  const expected = createHash("sha256").update(canonical, "utf8").digest("hex"); // same as `printf '%s' ... | sha256sum`
  assert.equal(docHash, expected, `${lang}: displayed hash == sha256(canonical json)`);
  const period = JSON.parse(canonical).period;
  assert.match(period, /^\d{4}-\d{2}$/);
  assert.notEqual(period, "2026-09", "period is derived from the data (Oct 2026 snapshot), not hard-coded");
  const body = await page.innerText("body");
  assert.ok(!/AADPS[०-९]/.test(body) && !/[0-9a-f]{4}[०-९]/.test(body.replace(/\s/g, "")), `${lang}: no Devanagari digit glued to hex`);
  console.log(`ok ${lang}: ${hash.slice(0, 14)}… period ${period}`);
  if (lang === "hi") await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/stmt_hi.png` : "/tmp/claude-0/d2s/stmt_hi.png", fullPage: false });
  await browser.close();
}
