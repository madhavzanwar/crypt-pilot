import type { PeriodPlan, SequenceResult } from "@/lib/types";
import { formatCurrency } from "@/components/ui/money";
import { cn } from "@/lib/utils";

const COLS: [string, (p: PeriodPlan) => string][] = [
  ["Income", (p) => formatCurrency(p.income)],
  ["Essential", (p) => formatCurrency(p.essential)],
  ["Discretionary", (p) => formatCurrency(p.discretionary)],
  ["Cut", (p) => formatCurrency(p.discretionary_cut)],
  ["Debt min", (p) => formatCurrency(p.debt_min)],
  ["Extra debt", (p) => formatCurrency(p.extra_debt)],
  ["Savings", (p) => formatCurrency(p.savings_contrib)],
  ["Cash end", (p) => formatCurrency(p.cash_end)],
  ["Cash P10-P90", (p) => `${formatCurrency(p.cash_p10)} - ${formatCurrency(p.cash_p90)}`],
  ["Debt left", (p) => formatCurrency(p.debt_balance)],
];

export function SequenceTable({ sequence }: { sequence: SequenceResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tnum">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
            <th className="py-2 pr-3 font-semibold">Month</th>
            {COLS.map(([h]) => (
              <th key={h} className="py-2 px-2 text-right font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sequence.periods.map((p) => (
            <tr key={p.period} className={cn("border-t border-black/[0.05]", !p.reserve_ok && "bg-rose-50/60")}>
              <td className="py-2 pr-3 font-semibold text-ink whitespace-nowrap">
                {p.month}
                {!p.reserve_ok && <span className="ml-1.5 text-rose-600">below reserve</span>}
              </td>
              {COLS.map(([h, f]) => (
                <td key={h} className="py-2 px-2 text-right text-graphite whitespace-nowrap">{f(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
