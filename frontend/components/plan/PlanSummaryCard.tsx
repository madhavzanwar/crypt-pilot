"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PlanResult } from "@/lib/types";
import { summarisePlan, summaryParts, summaryPlainText, type SummaryText } from "@/lib/planSummary";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/components/ui/money";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/components/i18nMoney";

const LOCALE = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" } as const;

/** The plan's plain-language summary, translated and with currency applied. null when the plan has no periods. */
export function usePlanSummary(plan: PlanResult): { title: string; parts: SummaryText } | null {
  const { t, lang } = useT();
  const { currency } = useCurrency(); // re-render when the currency changes: formatCurrency reads it
  void currency;
  const data = summarisePlan(plan);
  if (!data) return null;
  return { title: t("pl.sum.title"), parts: summaryParts(data, (k) => t(k), formatCurrency, LOCALE[lang] ?? "en-IN") };
}

export function CopySummaryButton({ text }: { text: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // clipboard API blocked (insecure origin, permissions): fall back to a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={copy} data-testid="plan-copy">
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {t("pl.copy")}
      </Button>
      <span role="status" aria-live="polite" className="text-xs font-semibold text-emerald-700" data-testid="plan-copied">
        {copied ? t("pl.copied") : ""}
      </span>
    </span>
  );
}

/** Reusable body so the on-screen card and the print layout show the same sentences. */
export function SummaryBody({ parts }: { parts: SummaryText }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-graphite" translate="no">
      <p className="font-semibold text-ink">{parts.intro}</p>
      {parts.steps.length > 0 && (
        <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-ink">
          {parts.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {parts.more && <p className="text-xs text-pewter">{parts.more}</p>}
      <p>{parts.outlook}</p>
      <p>{parts.reserve}</p>
      {parts.goal && <p>{parts.goal}</p>}
    </div>
  );
}

export function PlanSummaryCard({ plan }: { plan: PlanResult }) {
  const s = usePlanSummary(plan);
  if (!s) return null;
  return (
    <Card className="p-6 sm:p-8" data-testid="plan-summary">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{s.title}</CardTitle>
        <CopySummaryButton text={summaryPlainText(s.title, s.parts)} />
      </div>
      <SummaryBody parts={s.parts} />
    </Card>
  );
}
