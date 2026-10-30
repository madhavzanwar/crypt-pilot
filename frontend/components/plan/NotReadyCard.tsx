"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { PlanReadiness } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useT } from "@/components/i18nMoney";
import { fill } from "@/lib/planSummary";
import { startDemo } from "@/lib/user";

const LINK =
  "inline-flex min-h-11 w-full items-center justify-center rounded-chip px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 sm:w-auto";

/** First-time state: the plan needs a few complete months, so say how many we have and what to do about it. */
export function NotReadyCard({ readiness, guest }: { readiness: PlanReadiness; guest: boolean }) {
  const { t } = useT();
  const need = readiness.months_needed;
  const have = Math.min(readiness.months_available, need);
  const pct = need > 0 ? Math.round((have / need) * 100) : 0;
  const progress = fill(t("pl.nr.progress"), { have, need });
  return (
    <Card className="flex flex-col gap-5 p-6 sm:p-8" data-testid="plan-not-ready">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-fog text-graphite" aria-hidden>
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium text-ink sm:text-2xl">{fill(t("pl.nr.title"), { n: need })}</h2>
          <p className="mt-1 text-sm text-graphite">{t("pl.nr.what")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={need}
          aria-valuenow={have}
          aria-valuetext={progress}
          aria-label={progress}
          className="h-2.5 w-full overflow-hidden rounded-full bg-fog"
        >
          <div className="h-full rounded-full bg-lime-dark transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm font-semibold text-ink tnum" data-testid="plan-progress-text">{progress}</p>
        <p className="text-xs text-pewter">{t("pl.nr.note")}</p>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <Link href="/upload" className={`${LINK} bg-navy text-white hover:bg-navy-light`}>{t("pl.nr.upload")}</Link>
        <Link href="/connect" className={`${LINK} border border-mist bg-paper text-ink hover:bg-fog`}>{t("pl.nr.connect")}</Link>
        {guest && (
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => startDemo()}>{t("pl.nr.demo")}</Button>
        )}
      </div>
    </Card>
  );
}
