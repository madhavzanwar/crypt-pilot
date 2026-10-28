import type { PlanResult } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { StatTile } from "@/components/ui/StatTile";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RiskSummary({
  plan,
  selectedId,
  onSelect,
}: {
  plan: PlanResult;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const tol = plan.constraints.risk_tolerance;
  const labelOf = (id: string | null) => plan.sequences.find((s) => s.id === id)?.label ?? id;
  const all = plan.risk_adjusted ? [...plan.sequences, plan.risk_adjusted] : plan.sequences;

  return (
    <div className="flex flex-col gap-4">
      {plan.uncertainty_changed_choice && (
        <div role="note" className="rounded-surface border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Uncertainty changed the choice.</strong> On the P50 forecast alone, <strong>{labelOf(plan.p50_only_best_id)}</strong> wins;
          once shortfall risk is counted, <strong>{labelOf(plan.recommended_id)}</strong> is recommended.
        </div>
      )}
      <p className="text-sm text-graphite">{plan.rationale}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {all.map((s) => {
          const ok = s.shortfall_risk <= tol;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selectedId === s.id}
              className={cn(
                "flex flex-col gap-3 rounded-surface border p-4 text-left cursor-pointer transition-all bg-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2",
                selectedId === s.id ? "border-ember ring-1 ring-ember" : "border-black/[0.08] hover:bg-fog"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{s.label}</span>
                {s.id === plan.recommended_id && <Chip tone="accent">Recommended</Chip>}
                {s.id === plan.p50_only_best_id && s.id !== plan.recommended_id && <Chip tone="outline">P50-only best</Chip>}
                <Chip tone={ok ? "success" : "danger"}>{ok ? "Within tolerance" : "Over tolerance"}</Chip>
              </div>
              <p className="text-xs text-graphite">{s.description}</p>
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Shortfall risk" value={formatPercent(s.shortfall_risk)} sub={`P(cash<0) ${formatPercent(s.p_negative)}`} />
                <StatTile label="Goal progress" value={formatPercent(s.goal_progress)} sub={s.goal_met_p50 ? "Met on P50" : "Not met on P50"} />
                <StatTile label="Interest saved" value={formatCurrency(s.interest_saved)} />
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-pewter">
        Shortfall risk = P(cash below reserve in any month) across {plan.method.n_paths} simulated paths. Tolerance {formatPercent(tol)}.
      </p>
    </div>
  );
}
