import test from "node:test";
import assert from "node:assert/strict";

const { validateAddress, validateAddressStrict } = await import("@/lib/crypto/address/validate");

const GOOD = ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"];

test("BUG-104: valid addresses pass the strict check", () => {
  for (const a of GOOD) assert.equal(validateAddressStrict(a).ok, true, a);
  assert.equal(validateAddressStrict("DEMO-block-1", { allowDemo: true }).ok, true);
});

test("BUG-104: bad checksum / wrong length is no longer 'format looks valid'", () => {
  const badBase58 = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb";
  const badBech32 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp";
  const longTaproot = GOOD[3] + "q";
  for (const a of [badBase58, badBech32, longTaproot]) {
    assert.equal(validateAddress(a).ok, true, "format-only still accepts " + a);
    const r = validateAddressStrict(a);
    assert.equal(r.ok, false, a);
    assert.equal(r.reason, "checksum");
  }
});
