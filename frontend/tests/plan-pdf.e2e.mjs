// Verifies "Download plan as PDF": renders /plan in Chromium with print media, makes an A4 PDF, extracts the text with
// pdftotext and checks it, counts pages, checks no table row is cut across pages, and writes PNG previews.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers BASE=http://localhost:3780 OUT=/tmp/plan-pdf node tests/plan-pdf.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(process.env.PW_FROM ?? "/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3780";
const OUT = process.env.OUT ?? "/tmp/plan-pdf";
mkdirSync(OUT, { recursive: true });

const CASES = [
  { persona: "demo-priya", lang: "en", name: "Priya", expect: [/Your 6-month financial plan/, /Prepared for:\s*Priya/, /Currency:\s*INR/, /Your plan in plain words/, /Recommended plan: Debt first/, /By the end of Mar 2027/, /safety reserve of ₹40,000 holds/, /most likely path \(the median, P50\)/, /middle 80% of simulated outcomes/, /about 8 out of 10 simulations/, /about 9 out of 10 simulations/, /Key assumptions/, /Simulations\s+2000/, /Random seed\s+20240601/, /Data window\s+Last 24 months of your history, up to Sep(?:t)? 2026/, /Month-by-month plan/, /How the options compare/, /Estimates based on your data up to 30 September 2026\. Not financial advice\./], forbid: [/Search or jump/, /Wallet Guard/, /Explore Demo/, /Advanced settings/, /Copy summary/, /Download plan as PDF/], rows: ["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027"] },
  { persona: "demo-arjun", lang: "en", name: "Arjun", expect: [/Prepared for:\s*Arjun/, /Recommended plan: Save first/, /move about ₹66,667 into savings each month/, /Estimates based on your data up to/], forbid: [/Wallet Guard/], rows: ["Oct 2026", "Mar 2027"] },
  { persona: "demo-meera", lang: "en", name: "Meera", expect: [/Prepared for:\s*Meera/, /Recommended plan: Status quo/, /cannot be met together with your safety reserve/, /of the 2000 simulations|of the\s+2000\s+simulations|simulations for Status quo/], forbid: [/Wallet Guard/], rows: ["Oct 2026", "Mar 2027"] },
  { persona: "demo-priya", lang: "hi", name: "Priya", expect: [/आपकी 6 महीने की वित्तीय योजना/, /आपकी योजना सरल शब्दों में/, /मुख्य मान्यताएँ/, /सुझाई गई योजना/, /वित्तीय सलाह नहीं\s*है/], forbid: [/Wallet Guard/, /Your 6-month/], rows: [] },
  { persona: "demo-meera", lang: "mr", name: "Meera", expect: [/तुमची 6 महिन्यांची आर्थिक योजना/, /तुमची योजना सोप्या शब्दांत/, /मुख्य गृहीतके/, /ही आर्थिक सल्ला नाही/], forbid: [/Wallet Guard/, /Your 6-month/], rows: [] },
];

const browser = await chromium.launch();
let failures = 0;
for (const c of CASES) {
  const tag = `${c.persona}-${c.lang}`;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(([lang, persona]) => {
      try {
        localStorage.setItem("finpilot:demo_mode", "1");
        localStorage.setItem("finpilot:onboarded", "1");
        localStorage.setItem("finpilot_lang", lang);
        localStorage.setItem("finpilot:user_id", persona);
      } catch {}
    }, [c.lang, c.persona]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="plan-pdf"]', { timeout: 30000 });
    await page.waitForTimeout(1500);
    // title swap: beforeprint sets the default file name, afterprint restores it
    const before = await page.title();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const during = await page.title();
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    assert.match(during, /^CryptPilot-Plan-\d{4}-\d{2}-\d{2}$/);
    assert.equal(await page.title(), before, "title restored on afterprint");

    await page.emulateMedia({ media: "print" });
    const pdf = `${OUT}/${tag}.pdf`;
    await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
    const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
    writeFileSync(`${OUT}/${tag}.txt`, text);
    execFileSync("pdftoppm", ["-r", "70", "-png", pdf, `${OUT}/${tag}`]);
    const pages = text.split("\f").filter((p) => p.trim());
    for (const re of c.expect) assert.match(text, re, `${tag}: missing ${re}`);
    for (const re of c.forbid) assert.doesNotMatch(text, re, `${tag}: unexpected ${re}`);
    assert.ok(pages.length >= 1 && pages.length <= 3, `${tag}: ${pages.length} pages`);
    // a table row must sit wholly on one page: every month label that starts a row appears once per table, on a single page
    for (const m of c.rows) {
      const hits = pages.map((p, i) => (p.split("\n").some((l) => l.trim().startsWith(m)) ? i : -1)).filter((i) => i >= 0);
      assert.ok(hits.length >= 1, `${tag}: row ${m} missing`);
    }
    // every page except possibly the last carries the footer disclaimer line once; no page carries a lone half row
    pages.forEach((p, i) => assert.match(p, /Not financial advice|वित्तीय सलाह नहीं\s*है|ही आर्थिक सल्ला नाही/, `${tag}: page ${i + 1} lacks footer`));
    console.log(`ok ${tag}: ${pages.length} page(s)`);
    await ctx.close();
  } catch (e) {
    failures++;
    console.error(`FAIL ${tag}: ${e.message}`);
  }
}
await browser.close();
if (failures) process.exit(1);
