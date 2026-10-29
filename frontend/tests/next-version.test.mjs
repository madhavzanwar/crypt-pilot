// BUG-001: Next must be a release patched for the critical RCE advisories (> 16.4.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("next is patched past 16.4.0", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const [maj, min, pat] = pkg.dependencies.next.replace(/^[^\d]*/, "").split(".").map(Number);
  assert.ok(maj > 16 || (maj === 16 && (min > 4 || (min === 4 && pat >= 1))), pkg.dependencies.next);
});
