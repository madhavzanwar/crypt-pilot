// Run: node --experimental-strip-types --import ./tests/unit/register.mjs --test tests/unit/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeSecret } from "@/lib/crypto/address/seedGuard";
import { messageHasSecret } from "@/lib/crypto/extractAddress";
import { validateAddress } from "@/lib/crypto/address/validate";

const HEX = "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262";
const WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ"; // public test vector (51 chars)
const ZW = "​";

test("64-hex split by spaces, hyphens, dots and zero-width chars is a secret (BUG-102)", () => {
  const chunks = HEX.match(/.{8}/g)!;
  for (const sep of [" ", "-", ".", " - ", "_", `${ZW} `]) {
    const t = chunks.join(sep);
    assert.ok(messageHasSecret(t), `message sep=${JSON.stringify(sep)}`);
    assert.ok(looksLikeSecret(t), `field sep=${JSON.stringify(sep)}`);
  }
  assert.ok(messageHasSecret(`my key is ${chunks.join(" ")} please help`));
  assert.ok(messageHasSecret(`0x${HEX}`));
  assert.ok(messageHasSecret(HEX.slice(0, 20) + ZW + HEX.slice(20)));
});

test("WIF with a space, hyphen or zero-width char is a secret", () => {
  assert.ok(messageHasSecret(`${WIF.slice(0, 10)} ${WIF.slice(10)}`));
  assert.ok(messageHasSecret(`${WIF.slice(0, 10)}-${WIF.slice(10, 30)}-${WIF.slice(30)}`));
  assert.ok(looksLikeSecret(WIF.slice(0, 25) + ZW + WIF.slice(25)));
  assert.ok(looksLikeSecret("c" + "1".repeat(51))); // testnet WIF shape
});

test("ordinary text is not a secret", () => {
  assert.equal(messageHasSecret("Is bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh safe to pay?"), false);
  assert.equal(messageHasSecret("compare my rent and my food spend for the last three months please"), false);
  assert.equal(messageHasSecret("add bad face dead beef cafe"), false);
});

test("addresses: checksum is verified, invisible characters are trimmed (BUG-104/105)", () => {
  const good = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
  assert.equal(validateAddress(good).ok, true);
  assert.equal(validateAddress(good + ZW).ok, true);
  assert.deepEqual(validateAddress(good.slice(0, -1) + "m"), { ok: false, reason: "checksum" });
  assert.equal(validateAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").ok, true);
  assert.deepEqual(validateAddress("1Q8f6cESGGLkiExCwhnPCTzyLqmAUZg3Wv"), { ok: false, reason: "checksum" });
});

import { scanAddresses } from "@/lib/crypto/extractAddress";

test("scanAddresses returns one entry per address, capped at 3, and counts the ignored (BUG-103)", () => {
  const a = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
  const b = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const c = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";
  const d = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
  assert.deepEqual(scanAddresses(`compare ${a} and ${b}`), { addresses: [a, b], ignored: 0 });
  assert.deepEqual(scanAddresses(`${a} ${b} ${c} ${d}`), { addresses: [a, b, c], ignored: 1 });
  assert.deepEqual(scanAddresses("is this wallet safe to pay?"), { addresses: [], ignored: 0 });
});
