import type { PlanOutcomeRow } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { formatCurrency } from "@/components/ui/money";

/** Planned vs realized cash on the held-out test months. */
export function OutcomeTable({ rows, reserve }: { rows: PlanOutcomeRow[]; reserve: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tnum">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
            {["Period", "Planned cash", "Realized cash", "Gap", `Reserve ${formatCurrency(reserve)}`].map((h) => (
              <th key={h} className="py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} className="border-t border-black/[0.05] text-graphite">
              <td className="py-2 px-2 font-semibold text-ink">{r.period}</td>
              <td className="py-2 px-2">{formatCurrency(r.planned_cash)}</td>
              <td className="py-2 px-2">{formatCurrency(r.realized_cash)}</td>
              <td className="py-2 px-2">{formatCurrency(r.realized_cash - r.planned_cash)}</td>
              <td className="py-2 px-2">
                <Chip tone={r.reserve_breached ? "danger" : "success"}>{r.reserve_breached ? "Breached" : "Held"}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
