// BUG-011: security headers are configured and X-Powered-By is off.
import { test } from "node:test";
import assert from "node:assert/strict";

test("next.config sets security headers", async () => {
  const mod = await import("../next.config.ts");
  const cfg = mod.default;
  assert.equal(cfg.poweredByHeader, false);
  const rules = await cfg.headers();
  const keys = rules.flatMap((r) => r.headers.map((h) => h.key));
  for (const k of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Content-Security-Policy"]) {
    assert.ok(keys.includes(k), k);
  }
});
