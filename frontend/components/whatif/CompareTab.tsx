"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { simulate, type Baseline, type ScenarioActions, type SimResult } from "@/lib/scenario-sim";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

interface Scenario extends ScenarioActions {
  id: number;
  name: string;
}

const COLORS = ["#5f7f0c", "#a6d11a", "#0ea5e9", "#8b5cf6"];
const MAX_SCENARIOS = 4;
const HORIZONS = [3, 6, 12];
const NO_ACTIONS: ScenarioActions = { cutDiscretionary: 0, extraDebt: 0, extraSavings: 0, incomeChange: 0, startMonth: 1 };

// Used when the user has no linked data yet, so the tool is still usable.
const SAMPLE: Baseline = {
  income: 30000, expenses: 25000, discretionary: 8000, cash: 50000, debt: 60000, aprPct: 12, minPayment: 2000, reserve: 20000,
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function NumField({ label, value, onChange, step = 500 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-graphite">
      {label}
      <Input
        type="number"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="tnum"
      />
    </label>
  );
}

function ActionSlider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-graphite">
      <span className="flex justify-between">
        {label}
        <span className="tnum font-semibold text-ink">{formatCurrency(value)}</span>
      </span>
      <input type="range" min={0} max={max} step={500} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-lime-dark" />
    </label>
  );
}

function explain(base: Baseline, scenarios: Scenario[], results: SimResult[], months: number): string[] {
  const b = results[0];
  const out: string[] = [];
  scenarios.slice(1).forEach((s, i) => {
    const r = results[i + 1];
    const dCash = r.endCash - b.endCash;
    const dDebt = b.endDebt - r.endDebt;
    const dInt = b.totalInterest - r.totalInterest;
    const parts: string[] = [];
    if (dDebt > 0.5) parts.push(`pays down ${formatCurrency(dDebt)} more debt${dInt > 0.5 ? ` and saves ${formatCurrency(dInt)} interest` : ""}`);
    if (r.endSavings > 0.5) parts.push(`moves ${formatCurrency(r.endSavings)} into savings`);
    const cash = Math.abs(dCash) < 0.5 ? "leaves cash unchanged" : `leaves ${formatCurrency(Math.abs(dCash))} ${dCash > 0 ? "more" : "less"} cash`;
    let line = `${s.name} ${parts.length ? parts.join(" and ") + ", but " : ""}${cash} than ${scenarios[0].name} after ${months} months.`;
    if (r.firstBreachMonth !== null && b.firstBreachMonth === null)
      line += ` Warning: cash drops below your ${formatCurrency(base.reserve)} reserve in month ${r.firstBreachMonth}.`;
    out.push(line);
  });
  const best = results.reduce((bi, r, i) => (r.netWorth > results[bi].netWorth ? i : bi), 0);
  out.push(`Highest net worth (cash + savings - debt) after ${months} months: ${scenarios[best].name} at ${formatCurrency(results[best].netWorth)}.`);
  return out;
}

export function CompareTab() {
  const userId = useUserId();
  const { data: plan, loading: planLoading } = useAsync(() => api.plan(userId), [userId]);
  const { data: dash, loading: dashLoading } = useAsync(() => api.dashboard(userId), [userId]);

  if ((planLoading && !plan) || (dashLoading && !dash)) return <Skeleton className="h-96 w-full rounded-card" />;

  const seeded: Baseline | null =
    plan && dash && plan.forecast.length
      ? (() => {
          const debts = dash.debts;
          const debt = debts.reduce((s, d) => s + d.principal, 0);
          const disc = avg(plan.forecast.map((f) => f.discretionary.p50));
          return {
            income: Math.round(avg(plan.forecast.map((f) => f.income.p50))),
            expenses: Math.round(avg(plan.forecast.map((f) => f.essential.p50 + f.discretionary.p50))),
            discretionary: Math.round(disc),
            cash: Math.round(plan.starting_cash),
            debt: Math.round(debt),
            aprPct: debt ? Math.round((debts.reduce((s, d) => s + d.principal * d.interest_rate_apr, 0) / debt) * 10) / 10 : 0,
            minPayment: Math.round(debts.reduce((s, d) => s + d.minimum_payment, 0)),
            reserve: Math.round(plan.constraints.min_reserve),
          };
        })()
      : null;

  return <Planner key={userId + (seeded ? "d" : "s")} initial={seeded ?? SAMPLE} usingSample={!seeded} />;
}

function Planner({ initial, usingSample }: { initial: Baseline; usingSample: boolean }) {
  const [base, setBase] = useState<Baseline>(initial);
  const [months, setMonths] = useState(6);
  const [nextId, setNextId] = useState(3);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 0, name: "Current plan", ...NO_ACTIONS },
    { id: 1, name: "Save more", ...NO_ACTIONS, extraSavings: 5000 },
    { id: 2, name: "Debt first", ...NO_ACTIONS, cutDiscretionary: Math.min(5000, initial.discretionary), extraDebt: 3000 },
  ]);

  const results = useMemo(() => scenarios.map((s) => simulate(base, s, months)), [base, scenarios, months]);
  const notes = useMemo(() => explain(base, scenarios, results, months), [base, scenarios, results, months]);
  const chartData = useMemo(
    () => [
      { label: "Start", ...Object.fromEntries(scenarios.map((s) => [`s${s.id}`, base.cash])) },
      ...results[0].rows.map((_, i) => ({
        label: `M${i + 1}`,
        ...Object.fromEntries(scenarios.map((s, j) => [`s${s.id}`, Math.round(results[j].rows[i].cash)])),
      })),
    ],
    [base.cash, scenarios, results]
  );

  const patch = (id: number, p: Partial<Scenario>) => setScenarios((xs) => xs.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const set = (k: keyof Baseline) => (n: number) => setBase((b) => ({ ...b, [k]: n }));

  return (
    <div className="flex flex-col gap-5">
      {usingSample && (
        <p className="rounded-card bg-tint-lime px-4 py-3 text-sm text-ink">
          Showing sample numbers. <Link href="/connect" className="font-semibold underline">Connect a bank account</Link> to start from your own data.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Starting point</CardTitle>
          <CardDescription>Your numbers today. Edit any of them and everything below recalculates.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <NumField label="Monthly income (₹)" value={base.income} onChange={set("income")} />
          <NumField label="Monthly expenses (₹)" value={base.expenses} onChange={set("expenses")} />
          <NumField label="of which discretionary (₹)" value={base.discretionary} onChange={set("discretionary")} />
          <NumField label="Starting cash (₹)" value={base.cash} onChange={set("cash")} />
          <NumField label="Debt outstanding (₹)" value={base.debt} onChange={set("debt")} />
          <NumField label="Debt APR (%)" value={base.aprPct} onChange={set("aprPct")} step={0.5} />
          <NumField label="Required debt payment (₹/mo)" value={base.minPayment} onChange={set("minPayment")} />
          <NumField label="Emergency reserve (₹)" value={base.reserve} onChange={set("reserve")} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Scenarios</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-graphite">Projection</span>
          {HORIZONS.map((h) => (
            <Button key={h} size="sm" variant={months === h ? "default" : "outline"} className="rounded-full" onClick={() => setMonths(h)}>{h} months</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((s, i) => {
          const r = results[i];
          const dNet = r.netWorth - results[0].netWorth;
          return (
            <Card key={s.id} className="gap-4 overflow-hidden py-5">
              <div className="h-1 -mt-5" style={{ background: COLORS[i] }} />
              <CardHeader className="gap-1">
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Scenario name"
                    value={s.name}
                    onChange={(e) => patch(s.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-chip border border-transparent bg-transparent px-1 font-display text-base font-semibold text-ink outline-none hover:border-mist focus-visible:border-ink"
                  />
                  {i > 0 && (
                    <button aria-label={`Remove ${s.name}`} onClick={() => setScenarios((xs) => xs.filter((x) => x.id !== s.id))} className="rounded-full p-1.5 text-pewter hover:bg-fog">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                {i === 0 && <CardDescription>Baseline: nothing changes. Others are compared against this.</CardDescription>}
              </CardHeader>
              <CardContent className="grid gap-3">
                {i > 0 && (
                  <>
                    <ActionSlider label="Cut discretionary" value={s.cutDiscretionary} max={Math.max(base.discretionary, 500)} onChange={(n) => patch(s.id, { cutDiscretionary: n })} />
                    <ActionSlider label="Extra debt repayment" value={s.extraDebt} max={15000} onChange={(n) => patch(s.id, { extraDebt: n })} />
                    <ActionSlider label="Extra savings transfer" value={s.extraSavings} max={15000} onChange={(n) => patch(s.id, { extraSavings: n })} />
                    <ActionSlider label="Income change" value={s.incomeChange} max={20000} onChange={(n) => patch(s.id, { incomeChange: n })} />
                    <label className="flex items-center justify-between text-xs font-medium text-graphite">
                      Starts in month
                      <select value={s.startMonth} onChange={(e) => patch(s.id, { startMonth: Number(e.target.value) })} className="rounded-chip border border-mist bg-white px-2 py-1 text-ink">
                        {Array.from({ length: months }, (_, k) => k + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <div className="rounded-xl bg-fog/70 p-3">
                  <p className="text-xs text-pewter">Cash after {months} months</p>
                  <p className="font-display text-2xl font-semibold tnum text-ink">{formatCurrency(r.endCash)}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-graphite">
                    <dt>Savings</dt><dd className="text-right tnum text-ink">{formatCurrency(r.endSavings)}</dd>
                    <dt>Debt left</dt><dd className="text-right tnum text-ink">{formatCurrency(r.endDebt)}</dd>
                    <dt>Interest paid</dt><dd className="text-right tnum text-ink">{formatCurrency(r.totalInterest)}</dd>
                    <dt>Net worth</dt><dd className="text-right tnum font-semibold text-ink">{formatCurrency(r.netWorth)}</dd>
                  </dl>
                  {i > 0 && (
                    <Badge className={cn("mt-2", dNet >= 0 ? "bg-leaf/15 text-leaf hover:bg-leaf/15" : "bg-rose-50 text-rose-700 hover:bg-rose-50")}>
                      {dNet >= 0 ? "+" : ""}{formatCurrency(dNet)} vs baseline
                    </Badge>
                  )}
                </div>
                {r.firstBreachMonth !== null && (
                  <p className="flex items-center gap-1.5 rounded-chip bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                    <AlertTriangle className="size-3.5 shrink-0" /> Below reserve from month {r.firstBreachMonth}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {scenarios.length < MAX_SCENARIOS && (
          <button
            onClick={() => { setScenarios((xs) => [...xs, { id: nextId, name: `Plan ${nextId}`, ...NO_ACTIONS }]); setNextId((n) => n + 1); }}
            className="flex min-h-40 items-center justify-center gap-2 rounded-card border-2 border-dashed border-lime-dark/50 bg-tint-lime text-sm font-medium text-ink transition-colors hover:bg-lime/40"
          >
            <Plus className="size-4" /> Add scenario
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-display text-lg">Cash balance over time</CardTitle>
            <CardDescription>The dashed line is your emergency reserve.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={82} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <ReferenceLine y={base.reserve} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "Reserve", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }} />
                {scenarios.map((s, i) => (
                  <Line key={s.id} type="monotone" dataKey={`s${s.id}`} name={s.name} stroke={COLORS[i]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">What this means</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-ink">
            <ul className="grid gap-2">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <p className="text-xs text-pewter">
              Worked out from the simulation, not estimated. Assumes fixed income and spending, monthly interest at the APR above and no investment returns.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Month by month</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[640px] text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {scenarios.map((s, i) => (
                  <TableHead key={s.id} colSpan={3} className="text-ink">
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: COLORS[i] }} />{s.name}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow>
                <TableHead />
                {scenarios.map((s) => ["Cash", "Debt", "Savings"].map((h) => <TableHead key={s.id + h} className="font-medium text-pewter">{h}</TableHead>))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results[0].rows.map((row, k) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium text-ink">M{row.month}</TableCell>
                  {results.flatMap((r, j) => {
                    const x = r.rows[k];
                    return [
                      <TableCell key={`${j}c`} className={cn("tnum", x.belowReserve && "bg-rose-50 text-rose-700")}>{formatCurrency(x.cash)}</TableCell>,
                      <TableCell key={`${j}d`} className="tnum">{formatCurrency(x.debt)}</TableCell>,
                      <TableCell key={`${j}s`} className="tnum">{formatCurrency(x.savings)}</TableCell>,
                    ];
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
