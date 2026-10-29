"use client";

import { categoryLabel } from "@/components/ui/categoryLabel";
import { useState } from "react";
import { Eye, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MemberSpending } from "@/lib/types";

const MEMBER_COLOURS = ["#0fb67a", "#3b6bff", "#ff6b1a", "#e0a000", "#12a5b8", "#a855f7"];
const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];
const label = categoryLabel;

function Avatar({ m, colour, size = 40 }: { m: MemberSpending; colour: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: colour, fontSize: size * 0.4 }}
      aria-hidden
    >
      {m.avatar_letter}
    </span>
  );
}

/** Six monthly totals as small bars, so each person's trend is visible at a glance. */
function Trend({ m, colour }: { m: MemberSpending; colour: string }) {
  const max = Math.max(1, ...m.monthly_trend.map((t) => t.amount));
  return (
    <div className="flex h-10 items-end gap-1" aria-label={`${m.display_name} monthly spending, last 6 months`}>
      {m.monthly_trend.map((t, i) => (
        <span
          key={t.month}
          title={`${t.month}: ${formatCurrency(t.amount)}`}
          className="w-3 rounded-sm"
          style={{ height: `${Math.max(6, (t.amount / max) * 100)}%`, background: colour, opacity: i === m.monthly_trend.length - 1 ? 1 : 0.4 }}
        />
      ))}
    </div>
  );
}

/** What each person in the household spends. The owner (and editors) see everyone; a viewer only sees themselves. */
export function FamilySpending() {
  const userId = useUserId();
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<string>("all");
  const { data, loading, error } = useAsync(() => api.householdSpending(userId, days), [userId, days]);

  if (loading && !data) return <Skeleton className="h-72 w-full md:col-span-6 lg:col-span-12" />;
  if (error || !data) return null; // no household yet: the page's own create/join cards cover that case

  const colours = new Map(data.members.map((m, i) => [m.user_id, MEMBER_COLOURS[i % MEMBER_COLOURS.length]]));
  const active = data.members.find((m) => m.user_id === selected) ?? null;
  const rows = (active ? [active] : data.members).flatMap((m) => m.recent.map((t) => ({ ...t, m })))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, active ? 12 : 10);
  const topAmount = active ? Math.max(1, ...active.by_category.map((c) => c.amount)) : 1;

  return (
    <Card className="min-w-0 p-6 border border-black/[0.08] shadow-xs flex flex-col gap-6 md:col-span-6 lg:col-span-12">
      <CardHeader className="mb-0">
        <div className="flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-ink">Family spending</CardTitle>
            <p className="mt-0.5 text-xs text-graphite">
              What each person in {data.household_name} spent in the last {days} days. Card-bill payments and SIPs are left out so nothing is counted twice.
            </p>
          </div>
          <div className="flex gap-1 rounded-full bg-fog p-1" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                role="tab"
                aria-selected={days === p.days}
                onClick={() => setDays(p.days)}
                className={cn("cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors", days === p.days ? "bg-ink text-white" : "text-graphite hover:text-ink")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <div className="flex items-start gap-2 rounded-card bg-tint-leaf/60 px-4 py-3 text-xs text-ink">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        {data.can_view_all
          ? `You can see everyone's spending because you're ${data.viewer_role === "owner" ? "the owner" : "an editor"} of this household.`
          : "You can only see your own spending. The household owner can see everyone's."}
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter">Household total</p>
          <p className="text-2xl font-semibold text-ink tnum">{formatCurrency(data.total_spend)}</p>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-fog" role="img" aria-label="Share of household spending by member">
          {data.members.map((m) => (
            <span key={m.user_id} title={`${m.display_name}: ${m.share_pct}%`} style={{ width: `${m.share_pct}%`, background: colours.get(m.user_id) }} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.members.map((m) => {
          const colour = colours.get(m.user_id)!;
          const on = selected === m.user_id;
          const up = (m.change_pct ?? 0) > 0;
          return (
            <button
              key={m.user_id}
              type="button"
              onClick={() => setSelected(on ? "all" : m.user_id)}
              aria-pressed={on}
              className={cn("flex cursor-pointer flex-col gap-3 rounded-card border p-4 text-left transition-all", on ? "border-ink bg-white shadow-md" : "border-black/[0.08] bg-white/70 hover:border-black/20")}
            >
              <div className="flex items-center gap-3">
                <Avatar m={m} colour={colour} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{m.display_name}</p>
                  <p className="text-[11px] text-pewter">{m.relation ?? m.role}</p>
                </div>
                <span className="ml-auto text-[11px] font-semibold text-graphite tnum">{m.share_pct}%</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold text-ink tnum">{formatCurrency(m.total_spend)}</p>
                  {m.change_pct !== null ? (
                    <p className={cn("mt-0.5 flex items-center gap-1 text-[11px] font-semibold", up ? "text-rose-600" : "text-emerald-700")}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(m.change_pct)}% vs previous {days} days
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-pewter">{m.txn_count} payments</p>
                  )}
                </div>
                <Trend m={m} colour={colour} />
              </div>
              {m.by_category[0] ? (
                <p className="text-[11px] text-graphite">
                  Most on <b className="text-ink">{label(m.by_category[0].category)}</b> ({formatCurrency(m.by_category[0].amount)})
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-pewter">
            {active ? `${active.display_name}'s spending by category` : "Spending by person"}
          </p>
          <div className="flex flex-col gap-3">
            {active
              ? active.by_category.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-ink">{label(c.category)}</span>
                      <span className="text-graphite tnum">{formatCurrency(c.amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-fog">
                      <div className="h-2 rounded-full" style={{ width: `${(c.amount / topAmount) * 100}%`, background: colours.get(active.user_id) }} />
                    </div>
                  </div>
                ))
              : data.members.map((m) => (
                  <div key={m.user_id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-ink">{m.display_name}</span>
                      <span className="text-graphite tnum">{formatCurrency(m.total_spend)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-fog">
                      <div className="h-2 rounded-full" style={{ width: `${m.share_pct}%`, background: colours.get(m.user_id) }} />
                    </div>
                  </div>
                ))}
          </div>
          {active?.top_merchants.length ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {active.top_merchants.map((t) => (
                <Chip key={t.merchant} tone="neutral" className="text-[11px]">
                  {t.merchant} · {formatCurrency(t.amount)}
                </Chip>
              ))}
            </div>
          ) : null}
          {active ? (
            <button type="button" onClick={() => setSelected("all")} className="mt-4 cursor-pointer text-xs font-semibold text-graphite underline-offset-2 hover:underline">
              Show everyone
            </button>
          ) : (
            <p className="mt-4 text-[11px] text-pewter">Tap a person to see their categories and payments.</p>
          )}
        </div>

        <div className="lg:col-span-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-pewter">
            {active ? `Recent payments by ${active.display_name}` : "Recent payments, everyone"}
          </p>
          <div className="divide-y divide-black/[0.05]">
            {rows.map((t) => (
              <div key={`${t.m.user_id}-${t.id}`} className="flex items-center gap-3 py-2.5">
                <Avatar m={t.m} colour={colours.get(t.m.user_id)!} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{t.merchant}</p>
                  <p className="text-[11px] text-pewter">
                    {label(t.category)} · {formatDate(t.date)}
                    {!active ? ` · ${t.m.display_name}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink tnum">−{formatCurrency(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-pewter">Demo data for Priya&apos;s household is synthetic.</p>
    </Card>
  );
}
