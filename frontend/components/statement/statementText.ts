import type { Account } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A debt's account name: the linked account's own name; never a raw id (fallback is a plain generic label). */
export function debtLabel(accountId: string, accounts: Pick<Account, "id" | "name">[], fallback = "Loan account"): string {
  const hit = accounts.find((a) => a.id === accountId);
  if (hit?.name) return hit.name;
  if (!accountId || UUID.test(accountId) || /^[0-9a-f]{16,}$/i.test(accountId)) return fallback;
  return accountId.replace(/_/g, " ");
}

/** Metrics where a smaller number is the better outcome. */
const LOWER_IS_BETTER = /\b(interest|spend|spending|expenses?|cost|debt|fees?|months to reach|days to)\b/i;

export type ImpactTone = "gain" | "loss" | "neutral";

/** Whether an impact helps or hurts: a drop in interest paid is a gain, a drop in free cash flow is a loss. */
export function impactTone(metric: string, delta: number): ImpactTone {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) return "neutral";
  const better = LOWER_IS_BETTER.test(metric) ? delta < 0 : delta > 0;
  return better ? "gain" : "loss";
}
