// Shared Playwright helper for the d2 UI tests. Needs a running frontend (BASE_URL, default http://localhost:3400) + backend.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright");
export const BASE = process.env.BASE_URL ?? "http://localhost:3400";

export async function open(path, { w = 1360, h = 800, lang = "en", persona = "demo-priya", touch = false, ua } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, userAgent: ua });
  const page = await ctx.newPage();
  await page.addInitScript(([lang, persona]) => {
    try {
      localStorage.setItem("finpilot:demo_mode", "1");
      localStorage.setItem("finpilot_lang", lang);
      localStorage.setItem("finpilot:user_id", persona);
    } catch {}
  }, [lang, persona]);
  const logs = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);
  return { browser, page, logs };
}
