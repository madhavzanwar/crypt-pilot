import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("@x402/evm missing install: the wallet chunk import has a fallback, not an unhandled rejection", () => {
  const src = readFileSync(new URL("../components/crypto/web3/AttestDisclosure.tsx", import.meta.url), "utf8");
  assert.match(src, /import\("\.\/AttestScope"\)\.catch\(/);
  assert.match(src, /WalletToolsUnavailable/);
});
