"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { SequenceResult } from "@/lib/types";
import { formatCurrency } from "@/components/ui/money";

const SEQ_COLORS = ["#64748b", "#ff5900", "#0ea5e9", "#10b981", "#8b5cf6"];

/** P10-P90 cash band + P50 line per sequence (band-tuple pattern from dashboard/ForecastChart). */
export function CashBandChart({ sequences, reserve }: { sequences: SequenceResult[]; reserve: number }) {
  const data = (sequences[0]?.periods ?? []).map((p, i) => {
    const row: Record<string, string | number | [number, number]> = { month: p.month };
    for (const s of sequences) {
      const q = s.periods[i];
      if (!q) continue;
      row[`band_${s.id}`] = [q.cash_p10, q.cash_p90];
      row[`p50_${s.id}`] = q.cash_p50;
    }
    return row;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="h-64 sm:h-72 w-full">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.05)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-pewter)" }} tickLine={false} axisLine={{ stroke: "rgba(15, 23, 42, 0.08)" }} />
            <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-pewter)" }} axisLine={false} tickLine={false} width={82} />
            <Tooltip formatter={(v) => (Array.isArray(v) ? `${formatCurrency(v[0])} - ${formatCurrency(v[1])}` : formatCurrency(Number(v)))} />
            {sequences.map((s, i) => (
              <Area key={`b${s.id}`} dataKey={`band_${s.id}`} name={`${s.label} P10-P90`} stroke="none" fill={SEQ_COLORS[i % SEQ_COLORS.length]} fillOpacity={0.08} isAnimationActive={false} />
            ))}
            {sequences.map((s, i) => (
              <Line key={`l${s.id}`} type="monotone" dataKey={`p50_${s.id}`} name={`${s.label} P50`} stroke={SEQ_COLORS[i % SEQ_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
            <ReferenceLine y={reserve} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "Reserve", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
        {sequences.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SEQ_COLORS[i % SEQ_COLORS.length] }} />
            {s.label}
          </span>
        ))}
        <span className="text-pewter">Shaded = P10-P90 cash across simulated paths</span>
      </div>
    </div>
  );
}
