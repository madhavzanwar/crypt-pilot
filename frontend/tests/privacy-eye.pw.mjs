// BUG-059: with the privacy eye on, every element whose own text is a money amount must be blurred.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("/home/user/cryptiq/frontend/node_modules/playwright");
const BASE = process.env.BASE || "http://localhost:3230";
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(() => { localStorage.setItem("finpilot:demo_mode", "1"); localStorage.setItem("finpilot:user_id", "demo-priya"); });
  await page.goto(`${BASE}/household`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(8000);
  await page.getByLabel("Hide amounts").click();
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const re = /[₹$€£]\s*[-−+]?\s*\d/; const bad = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement; if (!el || el.closest("script,style,input,select,textarea,svg,header,[aria-hidden=true]") || !re.test(n.nodeValue)) continue;
      let blurred = false; for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).filter.includes("blur")) { blurred = true; break; }
      if (!blurred) bad.push(n.nodeValue.trim().slice(0, 40));
    }
    return bad;
  });
  console.log("unmasked:", res.length, res.slice(0, 8));
  await b.close(); if (res.length) process.exit(1); console.log("PASS");
})();
