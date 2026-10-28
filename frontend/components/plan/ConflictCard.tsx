import type { PlanParams, PlanResult, PlanRelaxation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

/** Maps a relaxation onto the GET /api/plan query params; null when it has no query equivalent. */
function toParams(r: PlanRelaxation): PlanParams | null {
  const k = r.kind.toLowerCase();
  if (k.includes("deadline") || k.includes("month")) {
    const m = Math.round(r.to_value);
    return { goal_month: m, horizon: Math.max(6, m) };
  }
  if (k.includes("target") || k.includes("goal")) return { goal_amount: Math.round(r.to_value) };
  if (k.includes("reserve")) return { reserve: Math.round(r.to_value) };
  if (k.includes("cut")) return { cut: r.to_value };
  return null;
}

export function ConflictCard({ plan, onApply }: { plan: PlanResult; onApply?: (p: PlanParams) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Chip tone="danger" className="self-start">Infeasible as stated</Chip>
      <ul className="flex flex-col gap-2">
        {plan.conflicts.map((c, i) => (
          <li key={i} className="rounded-surface border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{c.message}</li>
        ))}
      </ul>
      {plan.relaxations.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-pewter">Verified relaxations</span>
          {plan.relaxations.map((r, i) => {
            const p = toParams(r);
            return (
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-black/[0.08] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Chip tone={r.feasible ? "success" : "warning"}>{r.feasible ? "Feasible" : "Unverified"}</Chip>
                  {r.message}
                </div>
                {onApply && p && (
                  <Button size="sm" variant="secondary" onClick={() => onApply(p)}>Apply</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
