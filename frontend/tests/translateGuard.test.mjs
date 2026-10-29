// Run: node --experimental-strip-types --test tests/translateGuard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { toDevanagariDigits, toAsciiDigits, stripProtected, isProtectedToken } from "../components/translateGuard.ts";

const sha = createHash("sha256").update("{}").digest("hex");

test("a sha256 hash survives digit conversion byte for byte", () => {
  for (const h of [sha, `0x${sha}`, `hash: ${sha}`]) assert.equal(toDevanagariDigits(h), h);
  assert.match(toDevanagariDigits(`SHA-256: 0x${sha}`), new RegExp(`0x${sha}$`));
});

test("addresses, UUIDs and PAN are untouched", () => {
  const cases = [
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "3cd99dff-8c5a-4fe5-b3c7-c1bb437c9181",
    "AADPS9102K",
    "0x1a2b…9f",
    "bc1qar0…zzwf5",
    "FP-AUDIT-2026-09-PRIYA",
    "SHA-256",
  ];
  for (const c of cases) assert.equal(toDevanagariDigits(c), c, c);
});

test("ordinary numbers and amounts are still converted", () => {
  assert.equal(toDevanagariDigits("₹4,05,000 on 29 Oct 2026"), "₹४,०५,००० on २९ Oct २०२६");
  assert.equal(toDevanagariDigits("2026-09-29"), "२०२६-०९-२९");
  assert.equal(toDevanagariDigits("Rent due in 3 days"), "Rent due in ३ days");
});

test("mixed sentence: only the surrounding digits convert", () => {
  const out = toDevanagariDigits(`Sent 5 BTC to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq`);
  assert.equal(out, "Sent ५ BTC to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
});

test("round trip to ascii", () => {
  assert.equal(toAsciiDigits("₹४,०५,०००"), "₹4,05,000");
});

test("protected-only strings are not sent for translation", () => {
  assert.equal(/[A-Za-z]{2}/.test(stripProtected(`0x${sha}`)), false);
  assert.equal(/[A-Za-z]{2}/.test(stripProtected("bc1qar0…zzwf5")), false);
  assert.equal(/[A-Za-z]{2}/.test(stripProtected("Paid to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")), true);
});

test("short plain words with digits are not protected", () => {
  for (const t of ["Q3", "10k", "2026", "UPI2"]) assert.equal(isProtectedToken(t), false, t);
});
