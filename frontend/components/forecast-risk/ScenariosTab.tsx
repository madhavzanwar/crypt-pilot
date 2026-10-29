"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import type { ForecastRiskReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AXIS, GRID, Section, money, pct } from "./shared";
import { formatAxisCurrency, formatSignedCurrency } from "@/components/ui/money";

const COLORS: Record<string, string> = { current: "#64748b", cut_discretionary: "#ff5900", increase_savings: "#0ea5e9", extra_debt: "#8b5cf6" };

export function ScenariosTab({ r }: { r: ForecastRiskReport }) {
  const sc = r.scenarios!;
  const live = sc.outcomes.filter((o) => o.available);
  const data = r.periods.map((p, i) => {
    const row: Record<string, string | number> = { month: p.month };
    for (const o of live) row[o.id] = o.cash[i].p50;
    return row;
  });
  const rec = sc.recommendation;
  const signed = (v: number) => formatSignedCurrency(v);
  const rows: [string, (o: (typeof live)[number]) => string][] = [
    ["Median end balance", (o) => money(o.end_cash?.p50 ?? 0)],
    ["End balance range (P10-P90)", (o) => `${money(o.end_cash?.p10 ?? 0)} to ${money(o.end_cash?.p90 ?? 0)}`],
    ["Shortfall probability", (o) => pct(o.shortfall_risk)],
    ["Change in shortfall risk", (o) => `${o.risk_delta > 0 ? "+" : ""}${(o.risk_delta * 100).toFixed(1)} pts`],
    ["Spending avoided", (o) => money(o.spending_avoided)],
    ["Moved to savings", (o) => money(o.total_savings)],
    ["Extra debt repaid", (o) => money(o.total_extra_debt)],
    ["Interest saved", (o) => money(o.interest_saved)],
    ["Debt at end", (o) => money(o.ending_debt)],
    ["Debt vs current", (o) => signed(o.debt_change)],
    ["Net worth vs current", (o) => signed(o.net_worth_change)],
    ["Goal progress", (o) => pct(o.goal_progress)],
  ];
  return (
    <div className="flex flex-col gap-6">
      {rec && (
        <div className="flex gap-3 rounded-surface bg-lime p-5 text-ink">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-display text-lg font-semibold">Recommended: {rec.label}</div>
            <p className="mt-1 text-sm">{rec.rationale}</p>
            <p className="mt-1 text-xs text-ink/65">{rec.criteria}</p>
          </div>
        </div>
      )}

      <Section title="Scenario comparison" sub="All scenarios replay the same simulated paths, so differences come from the choice, not from luck">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tnum">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
                <th className="px-2 py-2 font-semibold" />
                {sc.outcomes.map((o) => (
                  <th key={o.id} className={cn("min-w-32 px-2 py-2 font-semibold", rec?.scenario_id === o.id && "text-lime-dark")}>
                    {o.label}{rec?.scenario_id === o.id ? " (recommended)" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, f]) => (
                <tr key={name} className="border-t border-black/[0.05] text-graphite">
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-ink">{name}</td>
                  {sc.outcomes.map((o) => <td key={o.id} className="whitespace-nowrap px-2 py-2">{o.available ? f(o) : "n/a"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Median cash by scenario" sub="Solid lines are medians; the dashed line is your reserve">
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
            <LineChart data={data} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={AXIS} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatAxisCurrency(v)} tick={AXIS} axisLine={false} tickLine={false} width={82} />
              <Tooltip formatter={(v) => money(Number(v))} />
              {live.map((o) => <Line key={o.id} dataKey={o.id} name={o.label} stroke={COLORS[o.id]} strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
              <ReferenceLine y={r.reserve} stroke="#e11d48" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
          {live.map((o) => (
            <span key={o.id} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: COLORS[o.id] }} />{o.label}</span>
          ))}
        </div>
      </Section>

      <Section title="Trade-offs" sub="What each option gives up">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sc.outcomes.map((o) => (
            <div key={o.id} className="rounded-card border border-black/[0.06] p-4">
              <div className="text-sm font-semibold text-ink">{o.label}</div>
              <p className="mt-0.5 text-xs text-pewter">{o.description}</p>
              {o.available ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-graphite">{o.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>
              ) : (
                <p className="mt-2 text-xs text-graphite">{o.unavailable_reason}</p>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
