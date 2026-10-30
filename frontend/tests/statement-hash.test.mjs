// QA-2/QA-3: the printed SHA-256 equals what Verify recomputes; Verify accepts every common spelling of it.
// Run: node --import ./tests/helpers/register.mjs --experimental-strip-types --test tests/statement-hash.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { statementDigest } from "../components/statement/auditHash.ts";
import { compareStatementHash, parsePastedHash } from "../components/statement/auditHashVerify.ts";

const data = {
  userId: "u1",
  accounts: [{ id: "a1", type: "checking", balance: 1000.5 }],
  transactions: [
    { id: "t2", date: "2026-04-02", amount: -12.3, category: "food", account_id: "a1" },
    { id: "t1", date: "2026-04-01", amount: 500, category: "income", account_id: "a1" },
  ],
  dashboard: {
    generated_at: "2026-04-30T10:00:00Z",
    health_score: { overall: 71.4, sub_scores: [{ name: "Savings", score: 60.2 }] },
    monthly_income: 5000, monthly_expenses: 3000, net_worth: 12345.678,
    debts: [{ principal: 200 }],
    forecast: { points: [{ p10: 1, p50: 2, p90: 3 }, { p10: 4, p50: 5, p90: 6 }] },
  },
};

test("printed hash is sha256 of the canonical JSON and is stable", () => {
  const d = statementDigest(data);
  assert.equal(d.hex, createHash("sha256").update(d.canonical, "utf8").digest("hex"));
  assert.equal(d.bytes32, `0x${d.hex}`);
  assert.equal(statementDigest(structuredClone(data)).hex, d.hex);
});

test("verify accepts the printed hash in every spelling", () => {
  const { hex } = statementDigest(data);
  for (const v of [hex, `0x${hex}`, hex.toUpperCase(), `0X${hex.toUpperCase()}`, `SHA256:${hex}`, `sha-256: ${hex}`, `  0x${hex}\n`])
    assert.equal(compareStatementHash(v, hex), "match", v);
});

test("verify rejects non-hashes and wrong hashes", () => {
  const { hex } = statementDigest(data);
  assert.equal(compareStatementHash("", hex), "empty");
  assert.equal(compareStatementHash("hello", hex), "invalid");
  assert.equal(compareStatementHash("0x1234", hex), "invalid");
  assert.equal(compareStatementHash(`${hex}00`, hex), "invalid");
  assert.equal(compareStatementHash("0x" + "0".repeat(64), hex), "mismatch");
  assert.equal(parsePastedHash("zz".repeat(32)).kind, "invalid");
});
