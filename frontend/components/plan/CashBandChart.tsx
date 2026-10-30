"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { SequenceResult } from "@/lib/types";
import { formatAxisCurrency, formatCurrency } from "@/components/ui/money";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/components/i18nMoney";
import { fill, sequenceLabel } from "@/lib/planSummary";

const SEQ_COLORS = ["#64748b", "#ff5900", "#0ea5e9", "#10b981", "#8b5cf6"];
const RESERVE_COLOR = "#e11d48";

function rows(sequences: SequenceResult[]) {
  return (sequences[0]?.periods ?? []).map((p, i) => {
    const row: Record<string, string | number | [number, number]> = { month: p.month };
    for (const s of sequences) {
      const q = s.periods[i];
      if (!q) continue;
      row[`band_${s.id}`] = [q.cash_p10, q.cash_p90];
      row[`p50_${s.id}`] = q.cash_p50;
    }
    return row;
  });
}

interface BodyProps {
  sequences: SequenceResult[];
  reserve: string | number;
  reserveLabel: string;
  /** Fixed pixel size (print layout, no ResizeObserver); omitted = fill the parent. */
  size?: { width: number; height: number };
  colors?: string[];
  /** Tooltips and animation are for the screen only. */
  interactive?: boolean;
}

function ChartBody({ sequences, reserve, reserveLabel, size, colors = SEQ_COLORS, interactive = true }: BodyProps) {
  const data = rows(sequences);
  const chart = (
    <ComposedChart data={data} margin={{ left: 8, right: 16, top: 12, bottom: 4 }} {...(size ?? {})}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.05)" vertical={false} />
      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-pewter)" }} tickLine={false} axisLine={{ stroke: "rgba(15, 23, 42, 0.08)" }} />
      <YAxis tickFormatter={(v: number) => formatAxisCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-pewter)" }} axisLine={false} tickLine={false} width={82} />
      {interactive && <Tooltip formatter={(v) => (Array.isArray(v) ? `${formatCurrency(v[0])} - ${formatCurrency(v[1])}` : formatCurrency(Number(v)))} />}
      {sequences.map((s, i) => (
        <Area key={`b${s.id}`} dataKey={`band_${s.id}`} name={`${s.label} P10-P90`} stroke="none" fill={colors[i % colors.length]} fillOpacity={size ? 0.18 : 0.08} isAnimationActive={false} />
      ))}
      {sequences.map((s, i) => (
        <Line key={`l${s.id}`} type="monotone" dataKey={`p50_${s.id}`} name={`${s.label} P50`} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
      ))}
      <ReferenceLine y={Number(reserve)} stroke={RESERVE_COLOR} strokeDasharray="4 4" label={{ value: reserveLabel, position: "insideTopRight", fontSize: 11, fill: RESERVE_COLOR }} />
    </ComposedChart>
  );
  if (size) return chart;
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
      {chart}
    </ResponsiveContainer>
  );
}

/** What each mark on the chart means: the solid line, the shaded band and the dashed reserve line. */
export function ChartKey({ lineColor = SEQ_COLORS[0] }: { lineColor?: string }) {
  const { t } = useT();
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-graphite" aria-label={t("pl.cap.key")} data-testid="plan-chart-key">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke={lineColor} strokeWidth="2.5" /></svg>
        {t("pl.cap.line")}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="12" aria-hidden><rect x="1" y="1" width="20" height="10" rx="2" fill={lineColor} fillOpacity="0.28" stroke={lineColor} strokeOpacity="0.5" /></svg>
        {t("pl.cap.band")}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke={RESERVE_COLOR} strokeWidth="2" strokeDasharray="4 3" /></svg>
        {t("pl.cap.reserve")}
      </li>
    </ul>
  );
}

/** One plain paragraph explaining the band, plus the simulated chance of dipping below the reserve when the plan has it. */
export function ChartCaption({ focus, nPaths }: { focus?: SequenceResult | null; nPaths?: number }) {
  const { t } = useT();
  let risk: string | null = null;
  // shortfall_risk is the share of simulated paths whose cash is below the reserve in any month, so it is safe to quote.
  if (focus && nPaths && Number.isFinite(focus.shortfall_risk)) {
    const label = sequenceLabel(focus.id, focus.label, (k) => t(k));
    const pct = focus.shortfall_risk > 0 && focus.shortfall_risk < 0.005 ? "<1%" : `${Math.round(focus.shortfall_risk * 100)}%`;
    risk = fill(t(focus.shortfall_risk > 0 ? "pl.cap.risk" : "pl.cap.risk_zero"), { pct, n: nPaths, label });
  }
  return (
    <p className="text-xs leading-relaxed text-graphite" translate="no" data-testid="plan-chart-caption">
      {t("pl.cap.text")}
      {risk && <> {risk}</>}
    </p>
  );
}

/** P10-P90 cash band + P50 line per sequence (band-tuple pattern from dashboard/ForecastChart). */
export function CashBandChart({ sequences, reserve, focus, nPaths }: { sequences: SequenceResult[]; reserve: number; focus?: SequenceResult | null; nPaths?: number }) {
  const { t } = useT();
  useCurrency(); // axis labels read the active currency
  return (
    <div className="flex flex-col gap-3">
      <div className="h-64 sm:h-72 w-full" role="img" aria-label={t("pl.cap.line") + ", " + t("pl.cap.band")}>
        <ChartBody sequences={sequences} reserve={reserve} reserveLabel={t("pl.cap.reserve_short")} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
        {sequences.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SEQ_COLORS[i % SEQ_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>
      <ChartKey />
      <ChartCaption focus={focus} nPaths={nPaths} />
    </div>
  );
}

/** Fixed-size vector chart of one sequence for the PDF layout (grayscale-safe: dark line, mid-grey band, red dashed reserve). */
export function PrintChart({ sequence, reserve, width = 660, height = 300 }: { sequence: SequenceResult; reserve: number; width?: number; height?: number }) {
  const { t } = useT();
  useCurrency();
  return (
    <ChartBody sequences={[sequence]} reserve={reserve} reserveLabel={t("pl.cap.reserve_short")} size={{ width, height }} colors={["#1f2937"]} interactive={false} />
  );
}
