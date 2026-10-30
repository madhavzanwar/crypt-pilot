"use client";

import { useState } from "react";
import { Gauge, Landmark, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { ForecastRiskQuery, ForecastRiskReport } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ForecastTab } from "@/components/forecast-risk/ForecastTab";
import { RiskTab } from "@/components/forecast-risk/RiskTab";
import { ScenariosTab } from "@/components/forecast-risk/ScenariosTab";
import { AccuracyTab } from "@/components/forecast-risk/AccuracyTab";
import { money, pct } from "@/components/forecast-risk/shared";
import { cn } from "@/lib/utils";
import { Controls } from "@/components/forecast-risk/Controls";
import { friendlyForecastError } from "@/components/forecast-risk/forecastInputs";

const TABS = [
  { id: "forecast", label: "Forecast" },
  { id: "risk", label: "Risk" },
  { id: "scenarios", label: "Scenarios" },
  { id: "accuracy", label: "Model accuracy" },
  { id: "assumptions", label: "Assumptions" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PROFILES = ["stable", "moderate", "volatile"] as const;
const TOLERANCES = [{ label: "Cautious (5%)", v: 0.05 }, { label: "Balanced (10%)", v: 0.1 }, { label: "Relaxed (20%)", v: 0.2 }];
const PILL = "cursor-pointer rounded-full border px-4 py-2 text-xs font-semibold transition-all";
const PILL_ON = "border-lime-dark bg-lime text-ink shadow-md";
const PILL_OFF = "border-black/[0.08] bg-white text-graphite hover:bg-fog hover:text-ink";

function Pills<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} className={cn(PILL, value === o.v ? PILL_ON : PILL_OFF)}>{o.label}</button>
      ))}
    </div>
  );
}

function Skel() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)}</div>
      <Skeleton className="h-80 w-full rounded-surface" />
    </div>
  );
}

export default function ForecastRiskPage() {
  const userId = useUserId();
  const [q, setQ] = useState<ForecastRiskQuery>({ source: "real", profile: "moderate", horizon: 6, tolerance: 0.1 });
  const [tab, setTab] = useState<TabId>("forecast");
  const [formKey, setFormKey] = useState(0);
  // an error already shown is dismissed when the person moves to another tab
  const [seenError, setSeenError] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync<ForecastRiskReport | null>(
    () => (userId ? api.forecastRisk(userId, q) : Promise.resolve(null)),
    [userId, JSON.stringify(q)],
  );
  const patch = (p: ForecastRiskQuery) => setQ((prev) => ({ ...prev, ...p }));
  const ok = data?.status === "ok" && data.summary && data.risk && data.scenarios && data.accuracy;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
      <div className="border-b border-black/[0.04] pb-4">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">Forecast & Risk</h1>
        <p className="mt-1 text-xs text-graphite sm:text-sm">
          Monte Carlo cash-flow forecast with prediction intervals, shortfall risk, scenario comparison and a backtest of how accurate the model has been.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Pills value={q.source!} onChange={(v) => patch({ source: v })} options={[{ v: "real", label: "My data" }, { v: "synthetic", label: "Synthetic history" }]} />
          <Pills value={q.horizon!} onChange={(v) => patch({ horizon: v })} options={[3, 6, 12].map((m) => ({ v: m, label: `${m} months` }))} />
        </div>
        {q.source === "synthetic" && (
          <Pills value={q.profile!} onChange={(v) => patch({ profile: v })} options={PROFILES.map((p) => ({ v: p, label: `${p[0].toUpperCase()}${p.slice(1)} income` }))} />
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-graphite">Risk tolerance</div>
          <Pills value={q.tolerance!} onChange={(v) => patch({ tolerance: v })} options={TOLERANCES} />
        </div>
        <Controls key={formKey} q={q} onApply={(n) => { setQ(n); setFormKey((k) => k + 1); }} />
      </Card>

      {data && (
        <div className={cn("rounded-card border px-4 py-3 text-xs", data.data_source.kind === "synthetic" ? "border-amber-300 bg-amber-50 text-ink" : "border-black/[0.06] bg-fog text-graphite")}>
          <span className="font-semibold text-ink">{data.data_source.label}</span> · {data.data_source.months_available} months
          {data.data_source.history_start && ` (${data.data_source.history_start} to ${data.data_source.history_end})`}. {data.data_source.disclosure}
        </div>
      )}

      {error && data && error !== seenError && (
        <p role="alert" className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{friendlyForecastError(error)}</p>
      )}

      {loading && !data ? (
        <Skel />
      ) : error && !data ? (
        <EmptyState title="Could not run the forecast" body={friendlyForecastError(error)} action={<Button variant="secondary" onClick={reload}>Retry</Button>} />
      ) : data && data.status === "insufficient_history" ? (
        <EmptyState
          title="Not enough history to forecast"
          body={data.message ?? undefined}
          action={<Button onClick={() => patch({ source: "synthetic" })}>Explore with synthetic data</Button>}
        />
      ) : ok ? (
        <div className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}>
          {data.warnings.length > 0 && (
            <ul className="list-disc rounded-card bg-amber-50 py-3 pl-8 pr-4 text-xs text-ink">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={`Cash in ${data.periods.length} months`} icon={Wallet} variant="lime"
              value={money(data.summary!.end_cash.p50)}
              sub={`P10-P90: ${money(data.summary!.end_cash.p10)} to ${money(data.summary!.end_cash.p90)}`}
              series={[data.starting_cash, ...data.periods.map((p) => p.cash.p50)]}
            />
            <KpiCard
              label="Shortfall probability" icon={ShieldAlert} value={pct(data.summary!.p_below_reserve)}
              sub={`below ${money(data.reserve)} reserve · ${data.summary!.risk_level} risk`}
              badge={{ text: `${pct(data.summary!.p_negative)} below zero`, positive: data.summary!.p_negative <= 0.05 }}
            />
            <KpiCard
              label="Median monthly net" icon={TrendingUp} value={money(data.summary!.median_net)}
              sub={`${money(data.summary!.median_income)} in, ${money(data.summary!.median_expenses)} out`}
              badge={{ text: data.summary!.median_net >= 0 ? "surplus" : "deficit", positive: data.summary!.median_net >= 0 }}
            />
            <KpiCard
              label="Simulation" icon={Gauge} value={`${data.method!.n_paths.toLocaleString("en-IN")} paths`}
              sub={`80% interval · seed ${data.method!.seed} · ${data.method!.window_months}-month window`}
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTab(t.id); setSeenError(error); }} className={cn(PILL, "py-2.5", tab === t.id ? PILL_ON : PILL_OFF)}>{t.label}</button>
            ))}
          </div>

          {tab === "forecast" && <ForecastTab r={data} />}
          {tab === "risk" && <RiskTab risk={data.risk!} />}
          {tab === "scenarios" && <ScenariosTab r={data} />}
          {tab === "accuracy" && <AccuracyTab a={data.accuracy!} />}
          {tab === "assumptions" && (
            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Landmark className="size-4" /> Method and assumptions</div>
              <p className="mb-2 text-xs text-graphite">Every number on this page is computed by the forecasting engine; no language model is involved in the figures.</p>
              <ul className="list-disc pl-5 text-xs text-graphite">{data.assumptions.map((a) => <li key={a} className="mt-1.5">{a}</li>)}</ul>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
