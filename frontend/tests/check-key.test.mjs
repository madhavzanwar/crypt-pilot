import test from "node:test";
import assert from "node:assert/strict";

const { keyOf } = await import("@/lib/crypto/useWalletCheck");
const { toCryptoLang } = await import("@/lib/crypto/lang");

test("BUG-006: the check key does not depend on the UI language", () => {
  assert.equal(keyOf.length, 1); // address only, no lang argument
  assert.equal(keyOf("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"), keyOf("  BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ "));
});

test("BUG-065: base58 addresses keep their case in the key", () => {
  const a = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  assert.equal(keyOf(a), a);
  assert.notEqual(keyOf(a), keyOf(a.toLowerCase()));
});

test("BUG-006: one language mapping (Marathi is Hindi) for Wallet Guard and Copilot", () => {
  assert.equal(toCryptoLang("en"), "en");
  assert.equal(toCryptoLang("hi"), "hi");
  assert.equal(toCryptoLang("mr"), "hi");
});
