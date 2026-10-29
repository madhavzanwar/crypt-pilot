import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("BUG-003: spans that print addresses and hashes opt out of AutoTranslate digit conversion", () => {
  const spans = {
    "components/crypto/guard/VerdictCard.tsx": "title={result.address}",
    "components/crypto/graph/GraphList.tsx": "title={n.id}",
    "components/crypto/graph/NodeDrawer.tsx": "title={node.id}",
    "components/crypto/council/ChainParts.tsx": "title={w.address}",
    "components/crypto/guard/WalletVerdictCard.tsx": "title={address}",
    "components/crypto/web3/Bits.tsx": "title={value}",
  };
  for (const [file, marker] of Object.entries(spans)) {
    const line = src(file).split("\n").find((l) => l.includes(marker));
    assert.ok(line, `${file} has ${marker}`);
    assert.match(line, /data-no-translate translate="no"/, file);
  }
});
