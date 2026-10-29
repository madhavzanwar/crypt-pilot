import type { PeriodForecast, ForecastMethod, PlanQuantiles } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";

const q = (v: PlanQuantiles) => `${formatCurrency(v.p10)} / ${formatCurrency(v.p50)} / ${formatCurrency(v.p90)}`;

export function ForecastTable({ forecast, method }: { forecast: PeriodForecast[]; method: ForecastMethod }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-surface border border-black/[0.06] bg-fog/50 p-4 text-xs text-graphite">
        <div className="font-semibold text-ink">{method.name}</div>
        <p className="mt-1">{method.description}</p>
        <p className="mt-1 text-pewter tnum">
          Horizon {method.horizon_months} months · {method.n_paths} paths · seed {method.seed} · window {method.window_months} months · {formatPercent(method.pi_level)} interval (P10-P90)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
              {["Month", "Income P10 / P50 / P90", "Essential P10 / P50 / P90", "Discretionary P10 / P50 / P90", "Debt min", "Net P10 / P50 / P90"].map((h) => (
                <th key={h} className="py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecast.map((f) => (
              <tr key={f.period} className="border-t border-black/[0.05] text-graphite">
                <td className="py-2 px-2 font-semibold text-ink whitespace-nowrap">{f.month}</td>
                <td className="py-2 px-2 whitespace-nowrap">{q(f.income)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{q(f.essential)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{q(f.discretionary)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{formatCurrency(f.debt_min)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{q(f.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
