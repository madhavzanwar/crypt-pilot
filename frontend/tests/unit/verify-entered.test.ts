// Run: node --experimental-strip-types --import ./tests/unit/register.mjs --test tests/unit/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { checkEnteredHash } from "@/lib/crypto/eas/verify";
import type { AttestSubject } from "@/lib/crypto/eas/subject";

const keccak = (s: string) => `0x${"ab".repeat(32)}${s ? "" : ""}`;
const subject = (acceptRawInput: boolean) => ({ acceptRawInput, candidates: () => [] }) as unknown as AttestSubject;

test("hash-shaped but malformed input is 'invalid' on statement and wallet screens alike (BUG-108)", () => {
  for (const raw of ["0xzz", "0x1234", "a".repeat(64)]) {
    assert.equal(checkEnteredHash(subject(true), raw, keccak).outcome, "invalid", raw);
    assert.equal(checkEnteredHash(subject(false), raw, keccak).outcome, "invalid", raw);
  }
});

test("free text is still derived on statements and a valid bytes32 is compared", () => {
  assert.equal(checkEnteredHash(subject(true), "SHA256:abc", keccak).outcome, "mismatch");
  assert.equal(checkEnteredHash(subject(false), `0x${"c".repeat(64)}`, keccak).outcome, "mismatch");
});
