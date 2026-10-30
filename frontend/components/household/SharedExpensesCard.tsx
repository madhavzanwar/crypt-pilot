"use client";

import { ArrowRightLeft } from "lucide-react";
import { useT } from "@/components/i18nMoney";

/**
 * Honest empty state for "Who owes who". The backend has no shared-expenses endpoint, so nothing is
 * calculated, no sample rows are shown and there are no add-row / settle-up controls that would not save.
 */
export function SharedExpensesCard() {
  const { t } = useT();
  return (
    <section className="rounded-card bg-white p-6 shadow-sm" aria-labelledby="shared-exp-h">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pewter">
        <ArrowRightLeft className="size-3.5" aria-hidden />
        {t("hs.title")}
      </div>
      <h3 id="shared-exp-h" className="mt-1 font-display text-lg font-semibold text-ink">
        {t("hs.empty")}
      </h3>
      <p className="mt-1 text-sm text-graphite">{t("hs.empty_d")}</p>
    </section>
  );
}
