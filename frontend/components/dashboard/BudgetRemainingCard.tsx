"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { CATEGORY_META, type SpendSummary } from "@/lib/spend";
import { formatCurrency } from "@/components/ui/money";
import { cn } from "@/lib/utils";

const BAR_TONES = ["bg-[#3f7d5c] text-white", "bg-lime text-ink", "bg-[#4fe0b0] text-ink"];

/** "Remaining monthly": share of the monthly budgets still unspent, with the three biggest budgets as bars. */
export function BudgetRemainingCard({ userId, spend }: { userId: string; spend: SpendSummary }) {
  const { t } = useT();
  const { data: budgets } = useAsync(() => api.budgets(userId), [userId]);
  const rows = (budgets ?? [])
    .map((b) => {
      const used = spend.categories.find((c) => c.category === b.category)?.total ?? 0;
      return { b, used, pct: b.monthly_limit > 0 ? used / b.monthly_limit : 0 };
    })
    .sort((a, b) => b.b.monthly_limit - a.b.monthly_limit)
    .slice(0, 3);
  const limit = rows.reduce((s, r) => s + r.b.monthly_limit, 0);
  const used = rows.reduce((s, r) => s + r.used, 0);
  const remaining = limit > 0 ? Math.max(0, Math.round((1 - used / limit) * 100)) : null;
  const message =
    remaining === null
      ? t("b.empty")
      : remaining >= 40
        ? t("b.great")
        : remaining >= 15
          ? t("b.watch")
          : t("b.close");

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-card bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm font-medium text-ink">
        <span>{t("b.title")}</span>
        <Link href="/budgets" className="inline-flex items-center gap-1 whitespace-nowrap hover:underline">
          {t("b.setting")} <ArrowUpRight className="size-4" />
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className="font-display text-5xl 2xl:text-6xl font-semibold tnum text-ink">
          {remaining ?? "--"}
          <span className="text-2xl text-ink/45 2xl:text-3xl">%</span>
        </p>
        <p className="min-w-0 max-w-[11rem] flex-1 text-right text-xs text-graphite">{message}</p>
      </div>
      {rows.length > 0 && (
        <div className="mt-auto grid min-w-0 grid-cols-3 items-end gap-2">
          {rows.map((r, i) => (
            <div
              key={r.b.id}
              className={cn("flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-2.5 2xl:p-3", BAR_TONES[i])}
              style={{ height: `${Math.max(96, Math.min(180, 60 + r.pct * 110))}px` }}
              title={`${formatCurrency(r.used)} of ${formatCurrency(r.b.monthly_limit)}`}
            >
              <span className="font-display text-lg font-semibold tnum 2xl:text-2xl">{Math.round(r.pct * 100)}%</span>
              <span className="truncate text-[11px] opacity-90 2xl:text-xs">{t("cat." + CATEGORY_META[r.b.category].label, CATEGORY_META[r.b.category].label)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
