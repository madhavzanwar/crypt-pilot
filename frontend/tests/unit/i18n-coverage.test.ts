// Run with the other unit tests (see secrets.test.ts). Every cr.* / web3.* key used in components/crypto has a hi + mr row (BUG-027).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ct, CRYPTO_STRING_KEYS } from "@/lib/crypto/i18n";

const root = path.resolve(import.meta.dirname, "../..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));

test("every t('cr.*'|'web3.*') key in components/crypto has Hindi and Marathi text", () => {
  const used = new Set<string>();
  for (const f of [...walk(path.join(root, "components/crypto")), path.join(root, "lib/crypto/eas/rules.ts")]) {
    if (!/\.tsx?$/.test(f)) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/["'`]((?:cr|web3)\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  }
  const have = new Set(CRYPTO_STRING_KEYS);
  const dynamic = new Set(["cr.inv.status."]);
  const missing = [...used].filter((k) => !have.has(k) && ![...dynamic].some((p) => k.startsWith(p)) && !k.endsWith("."));
  assert.deepEqual(missing, []);
  assert.notEqual(ct("mr", "cr.balance", "Your balance"), "Your balance");
  assert.notEqual(ct("hi", "cr.balance", "Your balance"), ct("mr", "cr.balance", "Your balance"));
  assert.equal(ct("en", "cr.balance", "Your balance"), "Your balance");
});
