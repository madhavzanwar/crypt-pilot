import type { BacktestRow, PlanTimeline } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";

const MODEL_LABEL: Record<BacktestRow["model"], string> = {
  bootstrap: "Bootstrap (model)",
  hist_avg: "Historical average",
  recurring: "Recurring-payment",
};

/** Train / validation / test bar; segment widths are proportional to month counts. */
function Timeline({ t }: { t: PlanTimeline }) {
  const segs = [
    { name: "Train", r: t.train, cls: "bg-slate-400" },
    { name: "Validation", r: t.validation, cls: "bg-sky-500" },
    { name: "Test (held out)", r: t.test, cls: "bg-ember" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 w-full overflow-hidden rounded-chip text-[11px] font-semibold text-white">
        {segs.map((s) => (
          <div
            key={s.name}
            className={`${s.cls} flex items-center justify-center whitespace-nowrap overflow-hidden`}
            style={{ flexGrow: s.r[1] - s.r[0] + 1, flexBasis: 0 }}
          >
            {s.name}
          </div>
        ))}
      </div>
      <p className="text-xs text-pewter tnum">
        {segs.map((s) => `${s.name}: months ${s.r[0]}-${s.r[1]}`).join(" · ")} · chosen window {t.chosen_window} months (picked on validation)
      </p>
    </div>
  );
}

export function BacktestTable({ rows, timeline }: { rows: BacktestRow[]; timeline: PlanTimeline }) {
  return (
    <div className="flex flex-col gap-4">
      <Timeline t={timeline} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-pewter">
              {["Model", "Stream", "MAE", "80% PI coverage", "Mean PI width"].map((h) => (
                <th key={h} className="py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-black/[0.05] text-graphite">
                <td className="py-2 px-2 font-semibold text-ink whitespace-nowrap">{MODEL_LABEL[r.model] ?? r.model}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.stream}</td>
                <td className="py-2 px-2 whitespace-nowrap">{formatCurrency(r.mae)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.model === "recurring" ? "n/a" : formatPercent(r.coverage)}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.model === "recurring" ? "n/a" : formatCurrency(r.mean_width)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
