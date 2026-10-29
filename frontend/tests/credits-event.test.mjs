import test from "node:test";
import assert from "node:assert/strict";

test("BUG-101: a paid check fires the event the pill listens for", async () => {
  const target = new EventTarget();
  globalThis.window = target;
  const { CREDITS_CHANGED_EVENT } = await import("@/lib/crypto/creditsEvents");
  const { announceCredits } = await import("@/lib/crypto/useWalletCheck");
  let hits = 0;
  target.addEventListener(CREDITS_CHANGED_EVENT, () => hits++);
  let stale = 0;
  target.addEventListener("cryptpilot:credits-updated", () => stale++);
  announceCredits({ creditsRemaining: 96 });
  assert.equal(hits, 1);
  assert.equal(stale, 0);
  announceCredits({}); // no balance in the answer: nothing to announce
  assert.equal(hits, 1);
});
