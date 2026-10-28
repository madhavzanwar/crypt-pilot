"use client";

import { api, type DemoWallet, type Verdict } from "@/lib/crypto/api";
import { useAsync } from "@/lib/hooks";

const ORDER: Verdict[] = ["BLOCK", "WARN", "ALLOW", "UNKNOWN"];

/** One wallet per expected verdict first (BLOCK, WARN, ALLOW, UNKNOWN), then the rest, up to `max`. */
export function pickDemoWallets(wallets: DemoWallet[], max = 4): DemoWallet[] {
  const picked: DemoWallet[] = [];
  for (const v of ORDER) {
    const w = wallets.find((x) => x.expected === v);
    if (w) picked.push(w);
  }
  for (const w of wallets) if (picked.length < max && !picked.includes(w)) picked.push(w);
  return picked.slice(0, max);
}

/**
 * Middle-ellipsis so a long address never overflows its container (the UNKNOWN example is a long bech32).
 * Short values are returned unchanged.
 */
export function middleEllipsis(value: string, head = 8, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Demo wallets from GET /api/crypto/demo-wallets (held-out test wallets), picked for variety. */
export function useDemoWallets(max = 4): { wallets: DemoWallet[]; loading: boolean; error: string | null } {
  const { data, loading, error } = useAsync(() => api.demoWallets(), []);
  return { wallets: data ? pickDemoWallets(data.wallets, max) : [], loading, error };
}
