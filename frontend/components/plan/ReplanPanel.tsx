"use client";

import { useState } from "react";
import type { PlanResult, PlanShock, ReplanResult } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatPercent } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";

const INPUT =
  "min-h-11 w-28 rounded-chip border border-black/[0.1] bg-white px-3 text-sm text-ink tnum outline-none focus-visible:ring-2 focus-visible:ring-ember";

const pick = (p: PlanResult) => p.sequences.find((s) => s.id === p.recommended_id) ?? p.sequences[0];

function BeforeAfter({ r }: { r: ReplanResult }) {
  const b = pick(r.before);
  const a = pick(r.after);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Chip tone="neutral">Before: {b?.label ?? "none"} ({formatPercent(b?.shortfall_risk ?? 0)} risk)</Chip>
        <Chip tone="accent">After: {a?.label ?? "none"} ({formatPercent(a?.shortfall_risk ?? 0)} risk)</Chip>
        <Chip tone={r.after.feasible ? "success" : "danger"}>{r.after.feasible ? "Still feasible" : "New conflict"}</Chip>
      </div>
      {r.after.conflicts.map((c, i) => (
        <p key={i} className="text-rose-700">{c.message}</p>
      ))}
      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
              {["Month", "Cash end before", "Cash end after", "Extra debt after", "Savings after"].map((h) => (
                <th key={h} className="py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(a?.periods ?? []).map((p, i) => {
              const old = b?.periods[i];
              const changed = r.changed_periods.includes(p.period);
              return (
                <tr key={p.period} className={`border-t border-black/[0.05] text-graphite ${changed ? "bg-amber-50/60" : ""}`}>
                  <td className="py-2 px-2 font-semibold text-ink">{p.month}{changed && " *"}</td>
                  <td className="py-2 px-2">{old ? formatCurrency(old.cash_end) : "-"}</td>
                  <td className="py-2 px-2">{formatCurrency(p.cash_end)}</td>
                  <td className="py-2 px-2">{formatCurrency(p.extra_debt)}</td>
                  <td className="py-2 px-2">{formatCurrency(p.savings_contrib)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pewter">* re-optimised period. Earlier periods are kept as executed.</p>
    </div>
  );
}

/** `run` posts a shock (live data); `initial` is a precomputed replan (scenario data). */
export function ReplanPanel({
  run,
  initial,
}: {
  run?: (shock: PlanShock) => Promise<ReplanResult>;
  initial?: ReplanResult;
}) {
  const [kind, setKind] = useState<PlanShock["kind"]>("income_change");
  const [period, setPeriod] = useState(3);
  const [value, setValue] = useState(-30);
  const [result, setResult] = useState<ReplanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await run(kind === "income_change" ? { kind, from_period: period, pct: value } : { kind, from_period: period, amount: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replan failed");
    } finally {
      setBusy(false);
    }
  }

  const shown = result ?? initial ?? null;
  return (
    <div className="flex flex-col gap-4">
      {run && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter">
            Shock
            <select
              className={INPUT + " w-56"}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as PlanShock["kind"]);
                setValue(e.target.value === "income_change" ? -30 : 60000);
              }}
            >
              <option value="income_change">Income change (%)</option>
              <option value="essential_expense">One-off essential expense</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter">
            From month
            <input className={INPUT} type="number" min={1} max={6} value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter">
            {kind === "income_change" ? "Change %" : "Amount"}
            <input className={INPUT} type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </label>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? "Replanning..." : "Replan"}</Button>
          {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
        </div>
      )}
      {shown ? <BeforeAfter r={shown} /> : <p className="text-sm text-graphite">Apply a shock to see how the plan is re-optimised.</p>}
    </div>
  );
}
