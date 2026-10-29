"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastRiskReport } from "@/lib/types";
import { AXIS, GRID, Section, money } from "./shared";
import { formatAxisCurrency } from "@/components/ui/money";

type Row = Record<string, string | number | [number, number] | null>;

export function ForecastTab({ r }: { r: ForecastRiskReport }) {
  const cash: Row[] = r.periods.map((p) => ({ month: p.month, band: [p.cash.p10, p.cash.p90], p50: p.cash.p50 }));
  const flow: Row[] = [
    ...r.history.map((h) => ({ month: h.month, hIncome: h.income, hExpenses: h.expenses })),
    ...r.periods.map((p) => ({
      month: p.month,
      incBand: [p.income.p10, p.income.p90] as [number, number], inc: p.income.p50,
      expBand: [p.expenses.p10, p.expenses.p90] as [number, number], exp: p.expenses.p50,
    })),
  ];
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: "rgba(15, 23, 42, 0.08)" }} minTickGap={16} />
      <YAxis tickFormatter={(v: number) => formatAxisCurrency(v)} tick={AXIS} axisLine={false} tickLine={false} width={82} />
      <Tooltip formatter={(v) => (Array.isArray(v) ? `${money(v[0])} - ${money(v[1])}` : money(Number(v)))} />
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <Section title="Cash balance forecast" sub="Median path and 80% prediction interval (P10-P90) under current spending, against your reserve">
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
            <ComposedChart data={cash} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              {axes}
              <Area dataKey="band" name="P10-P90" stroke="none" fill="#5f7f0c" fillOpacity={0.16} isAnimationActive={false} />
              <Line dataKey="p50" name="Median" stroke="#5f7f0c" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <ReferenceLine y={r.reserve} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "Reserve", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Income vs expenses" sub="Last 12 months of actuals, then the forecast median and P10-P90 band for each">
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
            <ComposedChart data={flow} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              {axes}
              <Area dataKey="incBand" name="Income P10-P90" stroke="none" fill="#5f7f0c" fillOpacity={0.16} isAnimationActive={false} />
              <Area dataKey="expBand" name="Expenses P10-P90" stroke="none" fill="#ff5900" fillOpacity={0.14} isAnimationActive={false} />
              <Line dataKey="hIncome" name="Income (actual)" stroke="#5f7f0c" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="hExpenses" name="Expenses (actual)" stroke="#ff5900" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="inc" name="Income (median)" stroke="#5f7f0c" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line dataKey="exp" name="Expenses (median)" stroke="#ff5900" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-pewter">Solid = actual, dashed = forecast median, shaded = 80% prediction interval. Expenses include essential and discretionary spending.</p>
      </Section>

      <Section title="Monthly forecast" sub="Median with P10-P90 range">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tnum">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
                {["Month", "Income", "Expenses", "Net (after debt minimums)", "Cash balance", "P(below reserve)"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.periods.map((p) => (
                <tr key={p.period} className="border-t border-black/[0.05] text-graphite">
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-ink">{p.month}</td>
                  {[p.income, p.expenses, p.net, p.cash].map((b, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-2"><span className="font-semibold text-ink">{money(b.p50)}</span> <span className="text-pewter">({money(b.p10)} to {money(b.p90)})</span></td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2">{(p.p_below_reserve * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
