import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("BUG-076: blank or invalid NEXT_PUBLIC_CHAIN_ID falls back to Base Sepolia", async () => {
  const { parseChainId } = await import("@/lib/crypto/env");
  assert.equal(parseChainId(undefined), 84532);
  assert.equal(parseChainId(""), 84532);
  assert.equal(parseChainId("  "), 84532);
  assert.equal(parseChainId("abc"), 84532);
  assert.equal(parseChainId("8453"), 8453);
});

test("BUG-108: a malformed hash gets the same 'invalid' answer on every surface", async () => {
  const { checkEnteredHash } = await import("@/lib/crypto/eas/verify");
  const subject = { acceptRawInput: true, candidates: () => [] };
  const keccak = () => "0x" + "ab".repeat(32);
  for (const bad of ["0xzz", "0x1234", "ab".repeat(32)]) assert.equal(checkEnteredHash(subject, bad, keccak).outcome, "invalid", bad);
  assert.equal(checkEnteredHash(subject, "some free text", keccak).outcome, "mismatch"); // raw text is still hashed
  assert.equal(checkEnteredHash(subject, "0x" + "ab".repeat(32), keccak).outcome, "mismatch");
});

test("BUG-106: demo chips are labelled with the verdict word, not the wallet note", () => {
  assert.doesNotMatch(src("components/crypto/guard/DemoChips.tsx"), /w\.note\.length/);
});

test("BUG-109: env var names are inside a 'for the site owner' disclosure and Connect is disabled without signing", () => {
  const s = src("components/crypto/web3/AttestFlow.tsx");
  assert.match(s, /For the site owner/);
  assert.match(s, /disabled=\{!openConnectModal \|\| !schemaValid\}/);
  assert.doesNotMatch(s.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/<details[\s\S]*?<\/details>/g, ""), /NEXT_PUBLIC_/);
});
