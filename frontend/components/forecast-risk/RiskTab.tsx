"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FrRisk } from "@/lib/types";
import { AXIS, GRID, RiskChip, Section, money, pct } from "./shared";

export function RiskTab({ risk }: { risk: FrRisk }) {
  const s = risk.severity;
  const stats: [string, string, string][] = [
    ["Chance cash falls below reserve", pct(risk.p_below_reserve), `at any point in the horizon (reserve ${money(risk.reserve)})`],
    ["Chance cash goes below zero", pct(risk.p_negative), "an overdraft in at least one month"],
    ["Typical first breach", risk.typical_breach_month ?? "None", "median first month below reserve, among paths that breach"],
    ["Typical shortfall if it happens", money(s.median_if_breach), `1-in-20 bad case ${money(s.p95_if_breach)}`],
    ["Expected shortfall", money(s.expected_shortfall), "average depth under reserve across all simulations"],
    ["Worst overdraft (P95)", money(s.p95_below_zero), "among simulations that go below zero"],
  ];
  const data = risk.by_month.map((m) => ({ month: m.month, below: m.p_below_reserve * 100, first: m.p_first_breach * 100 }));
  return (
    <div className="flex flex-col gap-6">
      <Section title="Shortfall risk" sub={`Your tolerance is ${pct(risk.tolerance)}; risk above it is flagged`}>
        <div className="mb-4"><RiskChip level={risk.level} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(([k, v, sub]) => (
            <div key={k} className="rounded-card bg-fog p-4">
              <div className="text-xs font-medium text-graphite">{k}</div>
              <div className="mt-1 font-display text-2xl font-semibold text-ink tnum">{v}</div>
              <div className="mt-0.5 text-[11px] text-pewter">{sub}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Risk by month" sub="Probability that the month-end balance is below your reserve, and that this is the first month it happens">
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
            <BarChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={AXIS} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} width={48} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <ReferenceLine y={risk.tolerance * 100} stroke="#5f7f0c" strokeDasharray="4 4" label={{ value: "Tolerance", position: "insideTopRight", fontSize: 11, fill: "#5f7f0c" }} />
              <Bar dataKey="below" name="Below reserve" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {data.map((d, i) => <Cell key={i} fill={d.below > risk.tolerance * 100 ? "#ff5900" : "#8fb82e"} />)}
              </Bar>
              <Bar dataKey="first" name="First breach" fill="#cbd5e1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Main risk factors" sub="Sensitivity from the simulation: how much risk disappears if one source of uncertainty is removed">
        <ul className="flex flex-col gap-2.5">
          {risk.factors.map((f) => (
            <li key={f.key} className="rounded-card border border-black/[0.06] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{f.label}</span>
                {f.impact !== null && (
                  <span className="rounded-full bg-fog px-2 py-0.5 text-[11px] font-semibold text-graphite tnum">
                    {f.impact >= 0.005 ? `drives ${(f.impact * 100).toFixed(0)} pts of risk` : "negligible"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-graphite">{f.message}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
