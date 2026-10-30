/**
 * Plain-language plan summary. Deterministic (no AI): every sentence is built from fields of the plan the backend
 * returned, so the text can never claim more than the data supports. Pure module (types only) so node --test can run it.
 */
import type { PeriodPlan, PlanResult, SequenceResult } from "./types";

export type ActionKind = "cut" | "extra_debt" | "savings";

export interface PlanAction {
  kind: ActionKind;
  /** 'YYYY-MM' of the first and last month of the run. */
  fromMonth: string;
  toMonth: string;
  months: number;
  /** INR per month, taken from the first month of the run. */
  amount: number;
}

export type ReserveStatus = "holds" | "p10_dips" | "p50_dips";
export type GoalStatus = "on_track" | "short" | "conflict";

export interface PlanSummaryData {
  sequenceId: string;
  label: string;
  /** The first (at most 3) actions in the order they start; `moreActions` counts the rest. */
  actions: PlanAction[];
  moreActions: number;
  horizon: number;
  end: { month: string; p10: number; p50: number; p90: number };
  reserve: {
    amount: number;
    status: ReserveStatus;
    /** 1-based month index and 'YYYY-MM' of the first month the bottom of the band (or the median) is below the reserve. */
    breachIndex?: number;
    breachMonth?: string;
  };
  goal: null | { amount: number; byIndex: number; byMonth: string; status: GoalStatus; progress: number };
}

const KIND_ORDER: ActionKind[] = ["cut", "extra_debt", "savings"];
const AMOUNT_OF: Record<ActionKind, (p: PeriodPlan) => number> = {
  cut: (p) => p.discretionary_cut,
  extra_debt: (p) => p.extra_debt,
  savings: (p) => p.savings_contrib,
};
/** A run continues while the monthly amount stays within 5% of the run's first month. */
const SAME = 0.05;

/** The sequence the plan recommends (the risk-adjusted one counts), else the first. */
export function recommendedSequence(plan: PlanResult): SequenceResult | null {
  const all = plan.risk_adjusted ? [...plan.sequences, plan.risk_adjusted] : plan.sequences;
  return all.find((s) => s.id === plan.recommended_id) ?? plan.sequences[0] ?? null;
}

/** Contiguous runs of the same action, ordered by start month then cut, extra debt, savings. */
export function planActions(periods: PeriodPlan[]): PlanAction[] {
  const out: (PlanAction & { start: number })[] = [];
  for (const kind of KIND_ORDER) {
    let run: (PlanAction & { start: number }) | null = null;
    periods.forEach((p, i) => {
      const a = AMOUNT_OF[kind](p);
      if (a > 0 && run && Math.abs(a - run.amount) <= SAME * run.amount) {
        run.toMonth = p.month;
        run.months += 1;
      } else {
        run = null;
        if (a > 0) {
          run = { kind, fromMonth: p.month, toMonth: p.month, months: 1, amount: a, start: i };
          out.push(run);
        }
      }
    });
  }
  const rank = (k: ActionKind) => KIND_ORDER.indexOf(k);
  return out.sort((a, b) => a.start - b.start || rank(a.kind) - rank(b.kind)).map((a) => ({ kind: a.kind, fromMonth: a.fromMonth, toMonth: a.toMonth, months: a.months, amount: a.amount }));
}

export function summarisePlan(plan: PlanResult, sequenceId?: string): PlanSummaryData | null {
  const seq = (sequenceId && [...plan.sequences, ...(plan.risk_adjusted ? [plan.risk_adjusted] : [])].find((s) => s.id === sequenceId)) || recommendedSequence(plan);
  if (!seq || seq.periods.length === 0) return null;
  const reserve = plan.constraints.min_reserve;
  const last = seq.periods[seq.periods.length - 1];
  const all = planActions(seq.periods);

  const p50At = seq.periods.findIndex((p) => p.cash_p50 < reserve);
  const p10At = seq.periods.findIndex((p) => p.cash_p10 < reserve);
  const status: ReserveStatus = p50At >= 0 ? "p50_dips" : p10At >= 0 ? "p10_dips" : "holds";
  const at = status === "p50_dips" ? p50At : p10At;

  const g = plan.constraints.goal;
  let goal: PlanSummaryData["goal"] = null;
  if (g) {
    const byIndex = Math.min(Math.max(g.by_period, 1), seq.periods.length);
    goal = {
      amount: g.amount,
      byIndex: g.by_period,
      byMonth: seq.periods[byIndex - 1].month,
      status: !plan.feasible ? "conflict" : seq.goal_met_p50 ? "on_track" : "short",
      progress: seq.goal_progress,
    };
  }
  return {
    sequenceId: seq.id,
    label: seq.label,
    actions: all.slice(0, 3),
    moreActions: Math.max(0, all.length - 3),
    horizon: seq.periods.length,
    end: { month: last.month, p10: last.cash_p10, p50: last.cash_p50, p90: last.cash_p90 },
    reserve: { amount: reserve, status, breachIndex: at >= 0 ? at + 1 : undefined, breachMonth: at >= 0 ? seq.periods[at].month : undefined },
    goal,
  };
}

export type Translate = (key: string) => string;

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 'YYYY-MM' -> "Oct 2026" in the given BCP-47 locale. Falls back to the raw string. */
export function formatMonth(ym: string, locale = "en-IN"): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return ym;
  }
}

/** Translated name of a sequence; falls back to the backend label for an id we have no string for. */
export function sequenceLabel(id: string, backendLabel: string, t: Translate): string {
  const risk = id.startsWith("risk_adjusted_");
  const base = risk ? id.slice("risk_adjusted_".length) : id;
  const key = `pl.seq.${base}`;
  const name = t(key);
  const plain = name === key ? (risk ? backendLabel.replace(/ \(risk-adjusted\)$/, "") : backendLabel) : name;
  return risk ? fill(t("pl.seq.risk_adjusted"), { label: plain }) : plain;
}

export interface SummaryText {
  intro: string;
  steps: string[];
  more: string | null;
  outlook: string;
  reserve: string;
  goal: string | null;
}

export function summaryParts(
  d: PlanSummaryData,
  t: Translate,
  money: (n: number) => string,
  locale = "en-IN",
): SummaryText {
  const mon = (ym: string) => formatMonth(ym, locale);
  const label = sequenceLabel(d.sequenceId, d.label, t);
  const stepKey = { cut: "cut", extra_debt: "debt", savings: "save" } as const;
  const steps = d.actions.map((a) =>
    fill(t(`pl.act.${stepKey[a.kind]}_${a.months > 1 ? "n" : "1"}`), { from: mon(a.fromMonth), to: mon(a.toMonth), amount: money(a.amount) }),
  );
  const intro = fill(t(d.actions.length ? "pl.sum.rec" : "pl.sum.rec_none"), { label });
  const more = d.moreActions > 0 ? fill(t(d.moreActions === 1 ? "pl.sum.more_1" : "pl.sum.more_n"), { n: d.moreActions }) : null;
  const outlook = fill(t("pl.sum.outlook"), { month: mon(d.end.month), p50: money(d.end.p50), p10: money(d.end.p10), p90: money(d.end.p90) });

  const r = d.reserve;
  const reserve = fill(t(`pl.sum.reserve_${r.status}`), {
    reserve: money(r.amount),
    n: d.horizon,
    k: r.breachIndex ?? 0,
    month: r.breachMonth ? mon(r.breachMonth) : "",
  });

  let goal: string | null = null;
  if (d.goal) {
    goal = fill(t(`pl.sum.goal_${d.goal.status}`), {
      amount: money(d.goal.amount),
      month: mon(d.goal.byMonth),
      pct: `${Math.round(d.goal.progress * 100)}%`,
    });
  }
  return { intro, steps, more, outlook, reserve, goal };
}

/** The whole summary as plain text, for the clipboard. */
export function summaryPlainText(title: string, s: SummaryText): string {
  const lines = [title, "", s.intro, ...s.steps.map((x, i) => `${i + 1}. ${x}`)];
  if (s.more) lines.push(s.more);
  lines.push("", s.outlook, s.reserve);
  if (s.goal) lines.push(s.goal);
  return lines.join("\n");
}
