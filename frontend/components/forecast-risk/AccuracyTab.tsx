"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { FrAccuracy } from "@/lib/types";
import { BacktestTable } from "@/components/plan/BacktestTable";
import { AXIS, GRID, Section, pct } from "./shared";

export function AccuracyTab({ a }: { a: FrAccuracy }) {
  if (!a.available || !a.timeline) {
    return <Section title="Model accuracy"><p className="text-sm text-graphite">{a.reason ?? "Backtesting is unavailable for this history."}</p></Section>;
  }
  const c = a.calibration;
  const bins = (c?.bins ?? []).map((b) => ({ x: b.mean_predicted * 100, y: b.observed * 100, n: b.count }));
  return (
    <div className="flex flex-col gap-6">
      <Section title="What the backtest found" sub={`${a.n_test_months} held-out months, scored with no look-ahead`}>
        <ul className="list-disc pl-5 text-sm text-graphite">{a.findings.map((f) => <li key={f} className="mt-1">{f}</li>)}</ul>
      </Section>

      <Section title="Forecast error vs baselines" sub="Chronological split: each forecast uses only earlier months. MAE is mean absolute error; the 80% interval should contain about 80% of actuals">
        <BacktestTable rows={a.rows} timeline={a.timeline} />
      </Section>

      {c && (
        <Section title="Risk calibration" sub={c.event}>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Forecasts scored", String(c.n_forecasts)],
              ["Mean predicted", pct(c.mean_predicted, 1)],
              ["Observed rate", pct(c.observed_rate, 1)],
              ["Brier score (model / baseline)", `${c.brier_model.toFixed(3)} / ${c.brier_hist_avg.toFixed(3)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-card bg-fog p-3">
                <div className="text-[11px] font-medium text-graphite">{k}</div>
                <div className="mt-0.5 font-display text-lg font-semibold text-ink tnum">{v}</div>
              </div>
            ))}
          </div>
          {c.low_sample && <p className="mb-3 text-xs text-ember">Few forecasts in the test window: treat calibration as indicative only.</p>}
          <div className="h-60 w-full max-w-md">
            <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
              <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" dataKey="x" domain={[0, 100]} unit="%" tick={AXIS} name="Predicted" label={{ value: "Predicted probability", position: "insideBottom", offset: -8, fontSize: 11, fill: "var(--color-pewter)" }} />
                <YAxis type="number" dataKey="y" domain={[0, 100]} unit="%" tick={AXIS} name="Observed" width={44} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip formatter={(v) => `${Number(v).toFixed(0)}%`} />
                <Scatter data={bins} fill="#5f7f0c" isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-pewter">Points on the dashed diagonal mean predicted risk matched what happened. The baseline is a normal approximation using historical mean and spread.</p>
        </Section>
      )}
    </div>
  );
}
