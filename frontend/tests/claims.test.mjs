import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("BUG-004: Copilot copy never hard-codes TigerGraph or Wispr (only the provider label shown when reported)", () => {
  const src = readFileSync(new URL("../lib/crypto/voice/strings.ts", import.meta.url), "utf8");
  const rows = src.split("\n").filter((l) => /tigergraph|wispr/i.test(l) && l.trim().startsWith('"cp.'));
  assert.deepEqual(rows.map((r) => r.trim().split('"')[1]), ["cp.voice.wispr"]);
});

test("BUG-004: engine names come from the status value", async () => {
  const { engineLabel } = await import("@/lib/crypto/voice/strings");
  assert.equal(engineLabel("networkx"), "NetworkX");
  assert.equal(engineLabel("tigergraph"), "TigerGraph");
  assert.equal(engineLabel(null), null);
  assert.equal(engineLabel(""), null);
});
