// BUG-026 / BUG-069: axe + keyboard checks. Run: node tests/a11y.e2e.mjs [route...]
// Fails on the structural rules this round fixed (names, landmarks, required parents); contrast is reported, not asserted.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { open } from "./_pw.mjs";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ["/dashboard", "/transactions", "/household", "/photos", "/scenarios?tab=tax", "/wallet-guard", "/statement", "/simulate", "/forecast-risk", "/plan"];
const MUST_BE_ZERO = ["select-name", "label", "button-name", "aria-required-parent", "aria-required-children", "nested-interactive", "landmark-no-duplicate-main", "landmark-one-main", "aria-valid-attr-value", "link-name"];
let failed = 0;
for (const route of ROUTES) {
  const { browser, page } = await open(route, { w: 1280, h: 900 });
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") })));
  const bad = res.filter((v) => MUST_BE_ZERO.includes(v.id));
  const mains = await page.locator("main").count();
  console.log(`${bad.length || mains !== 1 ? "FAIL" : "ok  "} ${route}  main=${mains}  other=[${res.filter((v) => !MUST_BE_ZERO.includes(v.id)).map((v) => v.id + "x" + v.n).join(", ")}]`);
  for (const v of bad) console.log(`     ${v.id} x${v.n}  ${v.sample}`);
  if (bad.length || mains !== 1) failed++;
  await browser.close();
}
process.exit(failed ? 1 : 0);
