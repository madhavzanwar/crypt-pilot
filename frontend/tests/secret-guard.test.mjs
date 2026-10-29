import test from "node:test";
import assert from "node:assert/strict";

const { looksLikeSecret } = await import("@/lib/crypto/address/seedGuard");
const { messageHasSecret } = await import("@/lib/crypto/extractAddress");

const HEX = "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262";
const WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";
const TWIF = "cVt4o7BGAig1UXywgGSmARhxMdzP5qvQsxKkSsc1XEkw3tDTQFpy";
const ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const OLD = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";

test("BUG-102: space and hyphen split keys are secrets (Copilot message guard)", () => {
  const spaced = HEX.match(/.{8}/g).join(" ");
  assert.equal(messageHasSecret(spaced), true);
  assert.equal(messageHasSecret(HEX.match(/.{8}/g).join("-")), true);
  assert.equal(messageHasSecret(`my key is ${spaced} please check`), true);
  assert.equal(messageHasSecret("e9873d79 c6d87dc0 fb6a5778 633389f4 453213303da61f20bd67fc233aa33262"), true);
  assert.equal(messageHasSecret(`${WIF.slice(0, 20)} ${WIF.slice(20)}`), true);
  assert.equal(messageHasSecret(`check ${WIF.slice(0, 10)}-${WIF.slice(10, 30)}-${WIF.slice(30)} now`), true);
  assert.equal(messageHasSecret(HEX.slice(0, 20) + "​" + HEX.slice(20)), true);
});

test("BUG-102: split keys are secrets in the address field guard too", () => {
  assert.equal(looksLikeSecret(HEX.match(/.{8}/g).join(" ")), true);
  assert.equal(looksLikeSecret(`${WIF.slice(0, 25)} ${WIF.slice(25)}`), true);
  assert.equal(looksLikeSecret(HEX), true);
});

test("BUG-105: testnet WIF and zero-width characters are caught", () => {
  assert.equal(looksLikeSecret(TWIF), true);
  assert.equal(looksLikeSecret(`${HEX.slice(0, 30)}​${HEX.slice(30)}`), true);
});

test("addresses and ordinary messages are not secrets", () => {
  for (const ok of [ADDR, OLD, "Is this wallet safe to pay? " + ADDR, "Will I face any cash deficit in the next 90 days?", "compare " + ADDR + " and " + OLD, "I paid 1000 2000 3000 rupees on 12 May"]) {
    assert.equal(messageHasSecret(ok), false, ok);
    assert.equal(looksLikeSecret(ok), false, ok);
  }
});

test("BUG-105: a trailing zero-width space does not make a valid address invalid", async () => {
  const { validateAddress } = await import("@/lib/crypto/address/validate");
  const r = validateAddress(`${ADDR}​`);
  assert.equal(r.ok, true);
  assert.equal(r.address, ADDR);
});

test("BUG-103: every address in a message is found (cap 3, the rest counted)", async () => {
  const { scanAddresses } = await import("@/lib/crypto/extractAddress");
  const two = scanAddresses(`compare ${ADDR} and ${OLD}`);
  assert.deepEqual(two.scans.map((s) => s.address), [ADDR, OLD]);
  assert.equal(two.ignored, 0);
  const A3 = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";
  const A4 = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";
  const four = scanAddresses(`${ADDR} ${OLD} ${A3} ${A4} ${ADDR}`);
  assert.equal(four.scans.length, 3);
  assert.equal(four.ignored, 1);
  assert.equal(scanAddresses("hello there").scans.length, 0);
  const typo = scanAddresses(`${OLD.slice(0, -1)}b`);
  assert.deepEqual(typo.scans.map((s) => s.checksumValid), [false]);
});

const { findSplitSecret, cleanHistory, REDACTED } = await import("@/lib/crypto/secretGuard");

test("QA3-2: key split over two messages is blocked and flagged", () => {
  assert.equal(findSplitSecret([], HEX), 0);
  assert.equal(findSplitSecret([HEX.slice(0, 32)], HEX.slice(32)), 1);
  assert.equal(findSplitSecret(["hello", HEX.slice(0, 20), HEX.slice(20, 40)], HEX.slice(40)), 2);
  assert.equal(findSplitSecret([WIF.slice(0, 25)], WIF.slice(25)), 1);
  assert.equal(findSplitSecret(["is it safe?", "what about taxes", "thanks"], "ok 1000"), -1);
  assert.equal(findSplitSecret(["I paid 1000"], "2000 rupees"), -1);
});

test("QA3-2: the chat popup source runs the guard before any request (text, voice and history)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/copilot/ChatPopup.tsx", import.meta.url), "utf8");
  const send = src.slice(src.indexOf("async function send("));
  assert.ok(send.indexOf("findSplitSecret") > 0 && send.indexOf("findSplitSecret") < send.indexOf("api.voiceAct"));
  assert.ok(send.indexOf("findSplitSecret") < send.indexOf("answer(message"));
  assert.match(src, /cleanHistory\(/);
  assert.match(src, /messageHasSecret\(text\)/); // voice transcript is never displayed
});

test("QA3-2: history never re-sends a blocked or split secret", () => {
  const h = [
    { role: "user", content: HEX.slice(0, 32) },
    { role: "assistant", content: "ok" },
    { role: "user", content: HEX.slice(32) },
    { role: "user", content: "what is my balance" },
    { role: "user", content: REDACTED },
  ];
  const out = cleanHistory(h);
  assert.deepEqual(out.map((x) => x.content), ["ok", "what is my balance"]);
});
