"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { ActionType, RecurringObligation, SimulationResult } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ForecastChart } from "@/components/dashboard/ForecastChart";
import { OptOutSimulator } from "@/components/simulate/OptOutSimulator";
import { formatCurrency, formatImpactValue } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScenarioKind = "cancel_subscription" | "prepay_debt" | "increase_sip";

const SCENARIOS: { kind: ScenarioKind; label: string; action: ActionType; icon: string }[] = [
  { kind: "cancel_subscription", label: "Cancel Subscription", action: "cancel_subscription", icon: "✂" },
  { kind: "prepay_debt", label: "Prepay Debt / Loan", action: "prepay_debt", icon: "⚡" },
  { kind: "increase_sip", label: "Increase Monthly SIP", action: "increase_sip", icon: "📈" },
];

function SimulateContent() {
  const userId = useUserId();
  const searchParams = useSearchParams();

  const actionParam = searchParams.get("action");
  const groupIdParam = searchParams.get("groupId");
  const debtIdParam = searchParams.get("debtId");
  const amountParam = searchParams.get("amount");

  const validScenarios: ScenarioKind[] = ["cancel_subscription", "prepay_debt", "increase_sip"];
  const isDeepLinked = Boolean(actionParam && validScenarios.includes(actionParam as ScenarioKind));

  const [scenario, setScenario] = useState<ScenarioKind>(() => {
    if (actionParam && validScenarios.includes(actionParam as ScenarioKind)) {
      return actionParam as ScenarioKind;
    }
    return "cancel_subscription";
  });

  const [groupId, setGroupId] = useState<string | null>(groupIdParam || null);
  const [debtId, setDebtId] = useState<string | null>(debtIdParam || null);

  const [extraAmount, setExtraAmount] = useState<number>(() => {
    if (amountParam) {
      const parsed = parseInt(amountParam, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return actionParam === "increase_sip" ? 3000 : 2000;
  });

  const [prefilledFromCopilot, setPrefilledFromCopilot] = useState<boolean>(isDeepLinked);

  // Sync state if searchParams change dynamically. Done during render (the
  // React-documented "adjust state on prop change" pattern) rather than in an
  // effect, so there's no extra render pass with stale values.
  const paramsKey = searchParams.toString();
  const [syncedParamsKey, setSyncedParamsKey] = useState(paramsKey);
  if (syncedParamsKey !== paramsKey) {
    setSyncedParamsKey(paramsKey);
    const action = searchParams.get("action") as ScenarioKind | null;
    if (action && validScenarios.includes(action)) {
      setScenario(action);
      const gId = searchParams.get("groupId");
      if (gId) setGroupId(gId);
      const dId = searchParams.get("debtId");
      if (dId) setDebtId(dId);
      const amt = searchParams.get("amount");
      if (amt) {
        const parsed = parseInt(amt, 10);
        if (!isNaN(parsed) && parsed > 0) setExtraAmount(parsed);
      }
      setPrefilledFromCopilot(true);
    }
  }

  const fetchDashboard = useCallback(() => api.dashboard(userId), [userId]);
  const { data: dashboard, loading: dashboardLoading } = useAsync(fetchDashboard, [userId]);

  const firstSubscription = dashboard?.recurring_obligations.find((o) => o.category === "subscriptions");
  const activeGroupId = groupId ?? firstSubscription?.group_id ?? null;
  const activeDebtId = debtId ?? dashboard?.debts[0]?.id ?? null;

  const actionParams = useMemo(() => {
    if (scenario === "cancel_subscription") return { group_ids: activeGroupId ? [activeGroupId] : [] };
    if (scenario === "prepay_debt") return { debt_id: activeDebtId, extra_payment: extraAmount };
    return { amount: extraAmount };
  }, [scenario, activeGroupId, activeDebtId, extraAmount]);

  const canRun =
    (scenario !== "cancel_subscription" || !!activeGroupId) &&
    (scenario !== "prepay_debt" || !!activeDebtId);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setGroupId(null);
    setDebtId(null);
    setResult(null);
    setError(null);
    setPrefilledFromCopilot(false);
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const action = SCENARIOS.find((s) => s.kind === scenario)!.action;
      const res = await api.simulate(userId, { action, action_params: actionParams });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-black/[0.04] pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-ink">
          What-If Financial Simulator
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-graphite">
          Simulate prospective financial adjustments. See genuine before vs. after cash-flow forecast diffs.
        </p>
      </div>

      {/* Deep Link Pre-fill Notification Badge */}
      {prefilledFromCopilot && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-chip bg-ember/[0.08] border border-ember/25 text-ink shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ember text-white text-[11px] font-bold shrink-0">
              ⚡
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
              <span className="text-xs font-bold text-ember-700">
                Pre-filled from Copilot Recommendation
              </span>
              <span className="text-[11px] text-graphite hidden sm:inline">
                &middot; Initialized for scenario:{" "}
                <strong className="text-ink font-semibold">
                  {SCENARIOS.find((s) => s.kind === scenario)?.label}
                </strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPrefilledFromCopilot(false)}
            className="text-xs text-pewter hover:text-ink transition-colors px-1 cursor-pointer shrink-0"
            title="Dismiss badge"
            aria-label="Dismiss Copilot pre-fill badge"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Scenario Selector Pills */}
      <div className="flex flex-wrap gap-2.5">
        {SCENARIOS.map((s) => {
          const active = scenario === s.kind;
          return (
            <button
              key={s.kind}
              type="button"
              onClick={() => {
                setScenario(s.kind);
                setResult(null);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer border",
                active
                  ? "bg-lime text-ink border-lime-dark shadow-md"
                  : "bg-white text-graphite border-black/[0.08] hover:bg-fog hover:text-ink"
              )}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Configuration Card */}
      <Card className="p-6 sm:p-8">
        <CardHeader>
          <CardTitle>Decision Parameters</CardTitle>
          <span className="text-xs text-pewter">Real-time before/after impact engine</span>
        </CardHeader>

        {dashboardLoading && !dashboard ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {scenario === "cancel_subscription" && (
              <SubscriptionPicker
                obligations={dashboard?.recurring_obligations ?? []}
                selected={activeGroupId}
                onSelect={setGroupId}
              />
            )}

            {scenario === "prepay_debt" && (
              <div className="flex flex-col gap-4">
                <label htmlFor="simulate-debt-select" className="text-xs font-semibold uppercase tracking-wider text-pewter">
                  Select Debt to Target
                </label>
                <select
                  id="simulate-debt-select"
                  className="w-full min-h-11 rounded-chip border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2"
                  value={activeDebtId ?? ""}
                  onChange={(e) => setDebtId(e.target.value)}
                >
                  {(dashboard?.debts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatCurrency(d.principal)} balance &middot; {d.interest_rate_apr.toFixed(1)}% APR
                    </option>
                  ))}
                  {activeDebtId && !(dashboard?.debts ?? []).some((d) => d.id === activeDebtId) && (
                    <option value={activeDebtId}>
                      Target Debt ID: {activeDebtId} (from Copilot)
                    </option>
                  )}
                </select>
                <AmountSlider
                  label="Extra Monthly Prepayment"
                  value={extraAmount}
                  onChange={setExtraAmount}
                  max={20000}
                />
              </div>
            )}

            {scenario === "increase_sip" && (
              <AmountSlider
                label="Additional Monthly SIP Allocation"
                value={extraAmount}
                onChange={setExtraAmount}
                max={20000}
              />
            )}

            <div className="pt-2 flex items-center gap-4">
              <Button
                variant="primary"
                size="md"
                onClick={run}
                disabled={!canRun || running}
                className="px-6 py-2.5"
              >
                {running ? "Simulating Impact..." : "Simulate Decision"}
              </Button>
              {error && <span className="text-xs text-rose-600 font-medium">⚠️ {error}</span>}
            </div>
          </div>
        )}
      </Card>

      {/* Simulation Result Presentation */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="flex flex-col gap-8"
          >
            {/* Impact Metric Summary Bento */}
            <Card className="p-6 sm:p-8 border-ember/25 bg-gradient-to-b from-white to-orange-50/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-ember text-white flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                  <CardTitle>Simulated Outcome & Financial Impact</CardTitle>
                </div>
                <Chip tone="accent" className="font-semibold text-xs">
                  {Math.round(result.confidence * 100)}% Model Confidence
                </Chip>
              </CardHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Health Score Delta */}
                <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-pewter">
                    Health Score Projection
                  </span>
                  <div className="flex items-baseline gap-3 mt-3">
                    <span className="text-lg text-pewter line-through tnum">
                      {Math.round(result.health_score_before)}
                    </span>
                    <span className="text-pewter">→</span>
                    <span className="font-display text-4xl font-bold text-ink tnum">
                      {Math.round(result.health_score_after)}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {result.health_score_after >= result.health_score_before ? "+" : ""}
                      {Math.round(result.health_score_after - result.health_score_before)} pts
                    </span>
                  </div>
                  <p className="text-[11px] text-pewter mt-2">Pillar impact based on debt-to-income improvement</p>
                </div>

                {/* Primary Metric Delta */}
                <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-pewter">
                    {result.impact.metric}
                  </span>
                  <div className="flex items-baseline gap-3 mt-3">
                    <span className="text-lg text-pewter line-through tnum">
                      {formatImpactValue(result.impact.metric, result.impact.before)}
                    </span>
                    <span className="text-pewter">→</span>
                    <span className="font-display text-4xl font-bold text-ink tnum">
                      {formatImpactValue(result.impact.metric, result.impact.after)}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      ({result.impact.delta >= 0 ? "+" : ""}
                      {formatImpactValue(result.impact.metric, result.impact.delta)})
                    </span>
                  </div>
                  <p className="text-[11px] text-pewter mt-2">Evaluation horizon: {result.impact.horizon}</p>
                </div>
              </div>
            </Card>

            {/* Before vs After Forecast Chart */}
            <Card className="p-6 sm:p-8">
              <CardHeader>
                <div>
                  <CardTitle>Cash-Flow Forecast: Baseline vs. Simulated</CardTitle>
                  <p className="text-xs text-pewter mt-0.5">
                    Solid Ember line: Simulated path &middot; Dashed gray line: Baseline path
                  </p>
                </div>
              </CardHeader>
              <ForecastChart
                forecast={result.forecast_after}
                compareForecast={result.forecast_before}
                compareLabel="Baseline"
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SubscriptionPicker({
  obligations,
  selected,
  onSelect,
}: {
  obligations: RecurringObligation[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const subs = obligations.filter(
    (o) => o.category === "subscriptions" || o.group_id === selected
  );
  const listToRender = subs.length > 0 ? subs : obligations;

  if (listToRender.length === 0 && !selected) {
    return (
      <EmptyState
        title="No recurring obligations found"
        body="Subscriptions detected in this account's transaction history will show up here."
      />
    );
  }

  const hasSelectedInList = listToRender.some((o) => o.group_id === selected);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
        Select Subscription to Cancel
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {listToRender.map((o) => {
          const isSelected = selected === o.group_id;
          return (
            <button
              key={o.group_id}
              type="button"
              onClick={() => onSelect(o.group_id)}
              className={cn(
                "flex min-h-11 items-center justify-between p-3.5 rounded-chip border text-left transition-all cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                isSelected
                  ? "border-navy bg-navy/5 ring-1 ring-navy"
                  : "border-black/[0.08] bg-white hover:bg-fog"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={cn("h-2 w-2 rounded-full", isSelected ? "bg-navy" : "bg-steel")} />
                <span className="text-sm font-semibold text-ink">{o.merchant}</span>
              </div>
              <span className="text-xs font-bold text-ink tnum">
                {formatCurrency(Math.abs(o.amount))}/mo
              </span>
            </button>
          );
        })}

        {selected && !hasSelectedInList && (
          <button
            type="button"
            onClick={() => onSelect(selected)}
            className="flex min-h-11 items-center justify-between p-3.5 rounded-chip border border-navy bg-navy/5 ring-1 ring-navy text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-navy" />
              <span className="text-sm font-semibold text-ink">Target Subscription</span>
            </div>
            <span className="text-[10px] font-bold text-navy uppercase">Selected ({selected})</span>
          </button>
        )}
      </div>
    </div>
  );
}

function AmountSlider({
  label,
  value,
  onChange,
  max = 20000,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const effectiveMax = Math.max(max, value);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-surface border border-black/[0.06] bg-fog/50">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-pewter">{label}</label>
        <span className="font-display text-xl font-bold text-ink tnum">
          {formatCurrency(value)}
          <span className="text-xs text-pewter font-normal"> /mo</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={effectiveMax}
        step={500}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ember cursor-pointer h-11 bg-mist rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      />
      <div className="flex justify-between text-[10px] text-pewter font-medium">
        <span>{formatCurrency(0)}</span>
        <span>{formatCurrency(Math.round(effectiveMax / 2))}</span>
        <span>{formatCurrency(effectiveMax)}</span>
      </div>
    </div>
  );
}

function SimulateSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-16 max-w-5xl mx-auto">
      <div className="border-b border-black/[0.04] pb-4">
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Skeleton className="h-10 w-44 rounded-full" />
        <Skeleton className="h-10 w-44 rounded-full" />
        <Skeleton className="h-10 w-44 rounded-full" />
      </div>
      <Card className="p-6 sm:p-8">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>
    </div>
  );
}

const TABS = [
  { id: "optout", label: "Opt-out Simulator" },
  { id: "whatif", label: "Advanced What-If" },
] as const;

function SimulateTabs() {
  const action = useSearchParams().get("action");
  // Copilot deep links target the what-if engine; adjust during render when the link changes.
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(action ? "whatif" : "optout");
  const [lastAction, setLastAction] = useState(action);
  if (action !== lastAction) {
    setLastAction(action);
    if (action) setTab("whatif");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={cn("flex w-full flex-wrap gap-2.5", tab === "whatif" && "mx-auto max-w-5xl")}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "cursor-pointer rounded-full border px-4 py-2.5 text-xs font-semibold transition-all",
              tab === t.id
                ? "border-lime-dark bg-lime text-ink shadow-md"
                : "border-black/[0.08] bg-white text-graphite hover:bg-fog hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "optout" ? <OptOutSimulator /> : <SimulateContent />}
    </div>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<SimulateSkeleton />}>
      <SimulateTabs />
    </Suspense>
  );
}
