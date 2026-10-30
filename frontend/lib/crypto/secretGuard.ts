import { messageHasSecret } from "@/lib/crypto/extractAddress";

/** How many earlier user messages (and how long each) are joined back together when looking for a split key. */
const MAX_JOIN = 8;
const MAX_PIECE = 120;

/**
 * Looks for a key or seed phrase that was typed across several chat messages. The new message is joined with the
 * most recent short messages (no separator and with a space) and each joined text goes through the normal guard.
 * Returns how many earlier messages are part of it (0 when the new message alone is a secret) or -1 when clean.
 */
export function findSplitSecret(previous: string[], next: string): number {
  if (messageHasSecret(next)) return 0;
  const tail: string[] = [];
  for (let i = previous.length - 1; i >= 0 && tail.length < MAX_JOIN; i--) {
    if (previous[i].length > MAX_PIECE) break;
    tail.unshift(previous[i]);
  }
  for (let n = 1; n <= tail.length; n++) {
    const parts = [...tail.slice(tail.length - n), next];
    if (messageHasSecret(parts.join("")) || messageHasSecret(parts.join(" "))) return n;
  }
  return -1;
}

export const REDACTED = "[removed: it looked like part of a secret key]";

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

/** Drops every history item that is, or together forms, a seed phrase or private key. Never re-send what was blocked. */
export function cleanHistory(history: HistoryItem[]): HistoryItem[] {
  const bad = new Set<number>();
  let ui = -1;
  const keptIdx: number[] = [];
  const kept: string[] = [];
  for (const h of history) {
    if (h.role !== "user") continue;
    ui += 1;
    const n = findSplitSecret(kept, h.content);
    if (n < 0) {
      keptIdx.push(ui);
      kept.push(h.content);
      continue;
    }
    bad.add(ui);
    for (const k of keptIdx.slice(keptIdx.length - n)) bad.add(k);
    kept.splice(kept.length - n, n);
    keptIdx.splice(keptIdx.length - n, n);
  }
  ui = -1;
  return history.filter((h) => {
    if (h.role === "assistant") return !messageHasSecret(h.content);
    ui += 1;
    return h.content !== REDACTED && !bad.has(ui);
  });
}
