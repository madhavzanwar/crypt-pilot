"use client";

import { useEffect, useState } from "react";
import type { PlanResult, SequenceResult } from "@/lib/types";
import { fill, formatMonth, sequenceLabel, summarisePlan, summaryParts } from "@/lib/planSummary";
import { formatCurrency } from "@/components/ui/money";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/components/i18nMoney";
import { onAuthChange } from "@/lib/firebase/auth";
import { DEMO_PERSONAS } from "@/lib/user";
import { ChartCaption, ChartKey, PrintChart } from "@/components/plan/CashBandChart";
import { SummaryBody } from "@/components/plan/PlanSummaryCard";

const LOCALE = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" } as const;

/** Default file name Chrome/Firefox propose for "Save as PDF": CryptPilot-Plan-YYYY-MM-DD. */
export function planFileTitle(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `CryptPilot-Plan-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Prints the page; the title (the suggested PDF file name) is swapped in for the print and restored afterwards. */
export function usePrintPlan() {
  useEffect(() => {
    let original: string | null = null;
    const before = () => {
      if (original === null) original = document.title;
      document.title = planFileTitle();
    };
    const after = () => {
      if (original !== null) document.title = original;
      original = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);
  return () => window.print();
}

function usePersonName(userId: string): string | null {
  const [signedIn, setSignedIn] = useState<string | null>(null);
  useEffect(
    () =>
      onAuthChange((u) => {
        const n = u?.displayName || u?.email?.split("@")[0];
        setSignedIn(n ?? null);
      }),
    [],
  );
  return DEMO_PERSONAS.find((p) => p.id === userId)?.label ?? signedIn;
}

function seqRows(plan: PlanResult): SequenceResult[] {
  return plan.risk_adjusted ? [...plan.sequences, plan.risk_adjusted] : plan.sequences;
}

/** Print-only A4 document (hidden on screen, see the @media print block in globals.css). Built from the same plan data as the page. */
export function PlanPrintView({ plan, userId }: { plan: PlanResult; userId: string }) {
  const { t, lang } = useT();
  const { currency } = useCurrency();
  const name = usePersonName(userId);
  const locale = LOCALE[lang] ?? "en-IN";
  const data = summarisePlan(plan);
  if (!data) return null;
  const tt = (k: string) => t(k);
  const parts = summaryParts(data, tt, formatCurrency, locale);
  const rec = seqRows(plan).find((s) => s.id === data.sequenceId) ?? plan.sequences[0];
  const label = sequenceLabel(rec.id, rec.label, tt);

  const first = rec.periods[0].month;
  const [fy, fm] = first.split("-").map(Number);
  const dataEnd = new Date(Date.UTC(fy, fm - 1, 0)); // last day of the month before the plan starts
  const fmtDate = (d: Date, tz?: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: tz }).format(d);
  const dataEndText = fmtDate(dataEnd, "UTC");
  const g = plan.constraints.goal;

  const assumptions: [string, string][] = [
    [t("pl.pdf.a_reserve"), formatCurrency(plan.constraints.min_reserve)],
    [t("pl.pdf.a_goal"), g ? fill(t("pl.pdf.a_goal_val"), { amount: formatCurrency(g.amount), month: formatMonth(rec.periods[Math.min(g.by_period, rec.periods.length) - 1].month, locale) }) : t("pl.pdf.a_goal_none")],
    [t("pl.pdf.a_horizon"), fill(t("pl.pdf.a_months"), { n: plan.method.horizon_months })],
    [t("pl.adv.sims"), String(plan.method.n_paths)],
    [t("pl.adv.seed"), String(plan.method.seed)],
    [t("pl.pdf.a_data"), fill(t("pl.pdf.a_data_val"), { w: plan.method.window_months, month: formatMonth(dataEnd.toISOString().slice(0, 7), locale) })],
  ];

  const n = formatCurrency;
  return (
    <div className="plan-print-root" id="plan-print-root" data-testid="plan-print" translate="no">
      <div className="pp-head">
        <div className="pp-brand">CryptPilot</div>
        <h1 className="pp-title">{t("pl.pdf.title")}</h1>
        <div className="pp-meta">
          <span><b>{t("pl.pdf.generated")}:</b> {fmtDate(new Date())}</span>
          {name && <span><b>{t("pl.pdf.for")}:</b> {name}</span>}
          <span><b>{t("pl.pdf.currency")}:</b> {currency}</span>
        </div>
      </div>

      <div className="pp-block">
        <h2>{t("pl.sum.title")}</h2>
        <SummaryBody parts={parts} />
      </div>

      <div className="pp-block">
        <h2>{fill(t("pl.pdf.chart"), { label })}</h2>
        <div className="pp-chart"><PrintChart sequence={rec} reserve={plan.constraints.min_reserve} /></div>
        <ChartKey lineColor="#1f2937" />
        <ChartCaption focus={rec} nPaths={plan.method.n_paths} />
      </div>

      <div className="pp-block">
        <h2>{t("pl.pdf.assump")}</h2>
        <table className="pp-table pp-assump">
          <tbody>
            {assumptions.map(([k, v]) => (
              <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pp-block">
        <h2>{fill(t("pl.pdf.periods"), { label })}</h2>
        <table className="pp-table">
          <thead>
            <tr>{["h_month", "h_income", "h_essential", "h_disc", "h_cut", "h_debtmin", "h_extra", "h_save"].map((k) => <th key={k}>{t(`pl.pdf.${k}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rec.periods.map((p) => (
              <tr key={p.period}>
                <th scope="row">{formatMonth(p.month, locale)}</th>
                <td>{n(p.income)}</td><td>{n(p.essential)}</td><td>{n(p.discretionary)}</td><td>{n(p.discretionary_cut)}</td>
                <td>{n(p.debt_min)}</td><td>{n(p.extra_debt)}</td><td>{n(p.savings_contrib)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="pp-table" style={{ marginTop: "4mm" }}>
          <thead>
            <tr>{["h_month", "h_cash", "h_range", "h_debt"].map((k) => <th key={k}>{t(`pl.pdf.${k}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rec.periods.map((p) => (
              <tr key={p.period}>
                <th scope="row">{formatMonth(p.month, locale)}{!p.reserve_ok && <span className="pp-flag"> ({t("pl.pdf.below")})</span>}</th>
                <td>{n(p.cash_end)}</td><td>{n(p.cash_p10)} - {n(p.cash_p90)}</td><td>{n(p.debt_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pp-block">
        <h2>{t("pl.pdf.outcomes")}</h2>
        <table className="pp-table">
          <thead>
            <tr>{["h_seq", "h_risk", "h_goal", "h_interest"].map((k) => <th key={k}>{t(`pl.pdf.${k}`)}</th>)}</tr>
          </thead>
          <tbody>
            {seqRows(plan).map((s) => (
              <tr key={s.id}>
                <th scope="row">{sequenceLabel(s.id, s.label, tt)}{s.id === data.sequenceId && <span className="pp-rec"> ({t("pl.pdf.recommended")})</span>}</th>
                <td>{Math.round(s.shortfall_risk * 100)}%</td><td>{Math.round(s.goal_progress * 100)}%</td><td>{n(s.interest_saved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
              </div>

      <div className="pp-foot">{fill(t("pl.pdf.footer"), { date: dataEndText })}</div>
    </div>
  );
}
