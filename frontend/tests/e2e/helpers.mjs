// Shared Playwright helpers for UI regression tests. Tests skip (not fail) when
// no browser or app is available: set E2E_BASE_URL (e.g. http://localhost:3300)
// and make `playwright` resolvable (NODE_PATH or local install) to run them.
import { createRequire } from "node:module";

export const BASE = process.env.E2E_BASE_URL || "";

export async function launch() {
  if (!BASE) return null;
  const require = createRequire(import.meta.url);
  let pw;
  try {
    pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
  } catch {
    return null;
  }
  return pw.chromium.launch();
}

export async function open(browser, path, width = 390, lang = "en", height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.addInitScript((l) => {
    try { localStorage.setItem("finpilot_lang", l); } catch {}
  }, lang);
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Elements (not position:fixed) that stick out of the viewport horizontally. */
export function overflowing(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const bad = [];
    document.querySelectorAll("body *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && getComputedStyle(e).position !== "fixed" && (r.right > cw + 1 || r.left < -1)) {
        bad.push(`${e.tagName}.${String(e.className).slice(0, 40)} ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
    });
    return bad;
  });
}
