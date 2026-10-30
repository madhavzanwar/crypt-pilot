import type { BudgetStatus } from "@/lib/types";

/**
 * Same definition as the /budgets page: used = spent / (limits + rollover),
 * remaining = 100 - used, over every budget (not just the biggest ones).
 */
export function budgetTotals(statuses: Pick<BudgetStatus, "monthly_limit" | "spent_so_far" | "rollover_amount">[]) {
  const limit = statuses.reduce((s, b) => s + b.monthly_limit, 0);
  const rollover = statuses.reduce((s, b) => s + (b.rollover_amount ?? 0), 0);
  const spent = statuses.reduce((s, b) => s + b.spent_so_far, 0);
  const cap = limit + rollover;
  const usedPct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : null;
  return { limit, rollover, spent, usedPct, remainingPct: usedPct === null ? null : 100 - usedPct };
}
