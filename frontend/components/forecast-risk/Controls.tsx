"use client";

import { useState } from "react";
import type { ForecastRiskQuery } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { validateDraft, type DraftErrors, type ForecastDraft } from "./forecastInputs";

const INPUT = "min-h-11 w-full rounded-chip border bg-white px-3 text-sm text-ink tnum outline-none focus-visible:ring-2 focus-visible:ring-ember";

/**
 * The Forecast & Risk input form. Values are drafted locally and sent to the engine only on Apply (each run is ~1s of
 * simulation). Invalid values are reported next to the field and are never sent or silently clamped.
 */
export function Controls({ q, onApply }: { q: ForecastRiskQuery; onApply: (q: ForecastRiskQuery) => void }) {
  const init = (v: number | undefined, scale = 1) => (v === undefined ? "" : String(Math.round(v * scale)));
  const [d, setD] = useState<ForecastDraft>({
    reserve: init(q.reserve), savings: init(q.savings), extra_debt: init(q.extra_debt), goal_amount: init(q.goal_amount),
    goal_month: init(q.goal_month), cut: init(q.cut ?? 0.2, 100), sims: String(q.sims ?? 2000), seed: String(q.seed ?? 42),
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const set = (k: keyof ForecastDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setD((p) => ({ ...p, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const apply = () => {
    const r = validateDraft(d, q, q.horizon ?? 6);
    setErrors(r.errors);
    if (r.query) onApply(r.query);
  };
  const field = (k: keyof ForecastDraft, label: string, placeholder?: string) => (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-graphite">
      {label}
      <input
        className={`${INPUT} ${errors[k] ? "border-rose-400" : "border-black/[0.1]"}`}
        inputMode="numeric"
        placeholder={placeholder}
        value={d[k]}
        onChange={set(k)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `fr-err-${k}` : undefined}
      />
      {errors[k] && <span id={`fr-err-${k}`} role="alert" className="text-[11px] font-medium text-rose-600">{errors[k]}</span>}
    </label>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {field("reserve", "Cash reserve (INR)", "Auto")}
        {field("cut", "Discretionary cut (%, max 30)")}
        {field("savings", "Extra savings / month", "Auto")}
        {field("extra_debt", "Extra debt repayment / month", "Auto")}
        {field("goal_amount", "Savings goal (INR)", "None")}
        {field("goal_month", `Goal by month # (1-${q.horizon ?? 6})`, "None")}
        {field("sims", "Simulations (500-10,000)")}
        {field("seed", "Random seed")}
      </div>
      <div><Button onClick={apply}>Apply and re-run</Button></div>
    </div>
  );
}
