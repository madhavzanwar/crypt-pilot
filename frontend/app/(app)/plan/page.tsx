"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { PlanParams, PlanResult, PlanScenario } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CashBandChart } from "@/components/plan/CashBandChart";
import { SequenceTable } from "@/components/plan/SequenceTable";
import { RiskSummary } from "@/components/plan/RiskSummary";
import { ConflictCard } from "@/components/plan/ConflictCard";
import { ReplanPanel } from "@/components/plan/ReplanPanel";
import { ForecastTable } from "@/components/plan/ForecastTable";
import { BacktestTable } from "@/components/plan/BacktestTable";
import { OutcomeTable } from "@/components/plan/OutcomeTable";
import { PlanSummaryCard } from "@/components/plan/PlanSummaryCard";
import { formatCurrency } from "@/components/ui/money";
import { cn } from "@/lib/utils";

const MY_DATA = "my_data";
const SOURCES: { key: string; label: string }[] = [
  { key: MY_DATA, label: "My data" },
  { key: "stable_income", label: "Stable income" },
  { key: "income_reduction", label: "Income reduction" },
  { key: "unexpected_expense", label: "Unexpected expense" },
  { key: "infeasible_target", label: "Infeasible target" },
  { key: "volatile_income_flip", label: "Volatile income flip" },
];

const INPUT =
  "min-h-11 w-32 rounded-chip border border-black/[0.1] bg-white px-3 text-sm text-ink tnum outline-none focus-visible:ring-2 focus-visible:ring-ember";

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card className="p-6 sm:p-8">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {sub && <p className="mt-0.5 text-xs text-pewter">{sub}</p>}
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-80 w-full rounded-surface" />
      <Skeleton className="h-48 w-full rounded-surface" />
    </div>
  );
}

function ParamsForm({ value, onApply }: { value: PlanParams; onApply: (p: PlanParams) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Re-seed the form when a relaxation changes the applied params (adjust-state-during-render).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft({});
  }
  const field = (k: keyof PlanParams, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter">
      {label}
      <input
        className={INPUT}
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        value={draft[k] ?? (value[k] === undefined ? "" : String(value[k]))}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    </label>
  );
  const apply = () => {
    const next: PlanParams = { ...value };
    for (const [k, v] of Object.entries(draft)) next[k as keyof PlanParams] = v === "" ? undefined : Number(v);
    onApply(next);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      {field("reserve", "Min reserve", "Auto (from your spending)")}
      {field("goal_amount", "Goal amount", "With goal month, e.g. 50000")}
      {field("goal_month", "Goal by month", "With goal amount, 1-6")}
      {field("tolerance", "Risk tolerance (0-1)", "Default 0.10")}
      <Button variant="primary" onClick={apply}>Plan</Button>
    </div>
  );
}

export default function PlanPage() {
  const userId = useUserId();
  const [source, setSource] = useState(MY_DATA);
  const [params, setParams] = useState<PlanParams>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Persona reset during render: params belong to the persona they were set for.
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setParams({});
    setSelectedId(null);
  }

  const isMine = source === MY_DATA;
  const fetchPlan = useCallback(
    () => (isMine ? api.plan(userId, params) : api.planScenario(source)),
    [isMine, userId, params, source]
  );
  const { data, error, loading, reload } = useAsync<PlanResult | PlanScenario>(fetchPlan, [isMine, userId, params, source]);

  const scenario = data && "plan" in data ? data : null;
  const plan: PlanResult | null = data ? (scenario ? scenario.plan : (data as PlanResult)) : null;
  const active = plan && (plan.sequences.find((s) => s.id === selectedId) ?? (plan.risk_adjusted?.id === selectedId ? plan.risk_adjusted : null) ?? plan.sequences.find((s) => s.id === plan.recommended_id) ?? plan.sequences[0]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-16">
      <div className="border-b border-black/[0.04] pb-4">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">Financial Plan</h1>
        <p className="mt-1 text-xs text-graphite sm:text-sm">
          A 6-month constrained action plan driven by a probabilistic monthly forecast. Uncertainty sets the reserve and the order of actions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setSource(s.key);
              setSelectedId(null);
            }}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-full border px-4 py-2.5 text-xs font-semibold transition-all",
              source === s.key ? "border-lime-dark bg-lime text-ink shadow-md" : "border-black/[0.08] bg-white text-graphite hover:bg-fog hover:text-ink"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isMine && (
        <Card className="p-6 sm:p-8">
          <CardHeader><CardTitle>Constraints and goal</CardTitle></CardHeader>
          <ParamsForm value={params} onApply={setParams} />
        </Card>
      )}

      {scenario && (
        <Card className="p-6 sm:p-8">
          <CardTitle>{scenario.title}</CardTitle>
          <ul className="mt-2 list-disc pl-5 text-xs text-graphite">
            {Object.entries(scenario.assumptions).map(([k, v]) => (
              <li key={k}><span className="font-semibold text-ink">{k}</span>: {typeof v === "object" ? JSON.stringify(v) : String(v)}</li>
            ))}
          </ul>
        </Card>
      )}

      {loading && !data ? (
        <PlanSkeleton />
      ) : error && !data && /months of history/i.test(error) ? (
        <EmptyState
          title="Not enough history to plan yet"
          body="A plan needs a few months of transactions. Upload a bank statement and it will appear here."
          action={<Link href="/upload"><Button variant="secondary">Upload a statement</Button></Link>}
        />
      ) : error && !data ? (
        <EmptyState
          title="Could not build the plan"
          body={error}
          action={<Button variant="secondary" onClick={reload}>Retry</Button>}
        />
      ) : !plan || !active ? (
        <EmptyState title="No plan available" body="Not enough transaction history to forecast monthly cash flow yet." />
      ) : (
        <>
          {!plan.feasible && (
            <Section title="Goal conflict" sub="The goal and reserve cannot both be met under the stated constraints.">
              <ConflictCard plan={plan} onApply={isMine ? (p) => setParams((prev) => ({ ...prev, ...p })) : undefined} />
            </Section>
          )}

          <PlanSummaryCard plan={plan} />

          <Section title="Recommendation and risk" sub={`Starting cash ${formatCurrency(plan.starting_cash)} · select a sequence to inspect it`}>
            <RiskSummary plan={plan} selectedId={active.id} onSelect={setSelectedId} />
          </Section>

          <Section title="Cash trajectory" sub="P50 line and P10-P90 band per action sequence against the reserve">
            <CashBandChart sequences={plan.sequences} reserve={plan.constraints.min_reserve} />
          </Section>

          <Section title={`Period plan: ${active.label}`}>
            <SequenceTable sequence={active} />
          </Section>

          <Section title="Replan after a shock" sub="Earlier months stay as executed; later months are re-conditioned and re-optimised.">
            <ReplanPanel
              key={source}
              initial={scenario?.replan}
              run={isMine ? (shock) => api.replan(userId, params, shock) : undefined}
            />
          </Section>

          <Section title="Monthly forecast" sub="P10 / P50 / P90 per stream">
            <ForecastTable forecast={plan.forecast} method={plan.method} />
          </Section>

          {scenario && (
            <>
              <Section title="Backtest" sub="Held-out test months: model vs. two baselines">
                <BacktestTable rows={scenario.backtest} timeline={scenario.timeline} />
              </Section>
              <Section title="Planned vs. realized" sub="Recommended plan replayed on the held-out months">
                <OutcomeTable rows={scenario.outcome} reserve={plan.constraints.min_reserve} />
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
