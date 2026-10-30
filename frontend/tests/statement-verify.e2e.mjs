// QA2-2/3/6: on /statement the printed hash is what Verify recomputes (all personas, several spellings);
// no raw UUIDs in liabilities; savings from interest are not badged "Net Loss".
// Run: BASE_URL=http://localhost:3730 node tests/statement-verify.e2e.mjs
import assert from "node:assert/strict";
import { open } from "./_pw.mjs";

for (const persona of ["demo-priya", "demo-arjun", "demo-meera"]) {
  const { browser, page } = await open("/statement", { persona });
  await page.waitForSelector('[data-testid="statement-hash"]', { timeout: 30000 });
  const printed = (await page.textContent('[data-testid="statement-doc-hash"]')).trim();
  const input = page.getByLabel("Statement hash (SHA-256)");
  const verdict = async (v) => {
    await input.fill(v);
    await page.getByRole("button", { name: "Verify", exact: true }).first().click();
    await page.waitForTimeout(150);
    return (await page.locator("[aria-live=polite]").filter({ hasText: /Match|Does not match|Not a hash/ }).first().innerText()).split("\n")[0].trim();
  };
  for (const v of [printed, `0x${printed}`, printed.toUpperCase(), `SHA256:${printed}`, `  0x${printed}  `]) assert.equal(await verdict(v), "Match", `${persona}: ${v}`);
  const recomputed = (await page.locator("text=SHA-256 (recomputed)").first().locator("xpath=..").innerText());
  assert.ok(recomputed.includes(printed), `${persona}: recomputed value equals printed`);
  assert.equal(await verdict("0x" + "0".repeat(64)), "Does not match");
  assert.equal(await verdict("not a hash"), "Not a hash");
  assert.equal(await verdict("0x1234"), "Not a hash");
  const doc = await page.locator("#executive-statement-document").innerText();
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(doc), `${persona}: no raw UUID in the statement`);
  assert.ok(!/saves ~.*interest[\s\S]{0,200}Net Loss/i.test(doc), `${persona}: interest savings not a net loss`);
  await browser.close();
}
console.log("statement verify e2e ok");
