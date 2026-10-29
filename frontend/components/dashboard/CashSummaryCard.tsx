"use client";

import { useT } from "@/lib/i18n";
import { useCallback } from "react";
import { PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";
import { BigAmount } from "@/components/dashboard/BigAmount";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

function Chip({ icon: Icon, label, value, tone }: { icon: typeof PiggyBank; label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-fog px-3 py-2 text-xs text-graphite">
      <Icon className="size-4 text-ink" />
      {label}
      <span className={`font-semibold tnum ${tone ?? "text-ink"}`}>{value}</span>
    </span>
  );
}

/** "My Balance" card: money you actually hold (bank + savings), with any debt shown separately so the headline is never a confusing negative. */
export function CashSummaryCard({
  userId,
  income,
  expenses,
  savingsRate,
}: {
  userId: string;
  income: number;
  expenses: number;
  savingsRate: number;
}) {
  const fetchAccounts = useCallback(() => api.accounts(userId), [userId]);
  const { data: accounts } = useAsync(fetchAccounts, [userId]);
  const { t } = useT();
  const held = (accounts ?? []).filter((a) => a.type === "checking" || a.type === "savings").reduce((s, a) => s + a.balance, 0);
  const owed = (accounts ?? []).filter((a) => a.balance < 0 && a.type !== "checking" && a.type !== "savings").reduce((s, a) => s - a.balance, 0);
  return (
    <div className="flex h-full flex-col justify-between gap-5 rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm font-medium text-ink">
        <span>{t("c.title")}</span>
        <span className="text-graphite">{t("c.now")}</span>
      </div>
      <div>
        <p className="text-sm text-graphite">{t("c.sub")}</p>
        <BigAmount value={held} className="mt-1 block text-4xl" />
        {owed > 0 && <p className="mt-1 text-xs text-graphite">{t("c.owe").replace("{n}", formatCurrency(owed))}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip icon={TrendingUp} label={t("c.in")} value={`+${formatCurrency(income)}`} tone="text-leaf" />
        <Chip icon={TrendingDown} label={t("c.out")} value={`-${formatCurrency(expenses)}`} />
        <Chip icon={PiggyBank} label={t("c.save")} value={formatPercent(savingsRate)} tone={savingsRate < 0 ? "text-rose-600" : "text-leaf"} />
      </div>
    </div>
  );
}
