"use client";

import { safeHref } from "@/components/safeHref";
import { useT } from "@/lib/i18n";
import { useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { formatCurrency } from "@/components/ui/money";

interface Track {
  title: string;
  blurb: string;
  links: { label: string; note: string; href: string }[];
}

// Official portals only. Shown for the answer to "Who are you?" in the questionnaire.
const TRACKS: Record<string, Track> = {
  Student: {
    title: "Student plan",
    blurb: "You may not earn yet, so the focus is stretching your allowance and finding money you are entitled to.",
    links: [
      { label: "National Scholarship Portal", note: "Central and state scholarships in one place", href: "https://scholarships.gov.in" },
      { label: "PM-Vidyalaxmi", note: "Collateral-free education loans", href: "https://pmvidyalaxmi.co.in" },
    ],
  },
  Farmer: {
    title: "Farmer plan",
    blurb: "Income comes in seasons, so plan around harvests and use the schemes meant for farmers.",
    links: [
      { label: "PM-KISAN", note: "₹6,000 a year income support", href: "https://pmkisan.gov.in" },
      { label: "PM Fasal Bima Yojana", note: "Crop insurance", href: "https://pmfby.gov.in" },
      { label: "Kisan Credit Card", note: "Low-interest crop loans", href: "https://www.myscheme.gov.in" },
    ],
  },
  "Business owner": {
    title: "Business plan",
    blurb: "Keep business and personal money apart, and never miss a filing date.",
    links: [
      { label: "GST filing dates", note: "GSTR-1 by the 11th, GSTR-3B by the 20th (monthly filers)", href: "https://www.gst.gov.in" },
      { label: "MUDRA loans", note: "Loans for small businesses", href: "https://www.mudra.org.in" },
      { label: "Udyam registration", note: "Free MSME registration", href: "https://udyamregistration.gov.in" },
    ],
  },
  Retired: {
    title: "Retirement plan",
    blurb: "Protect what you have and keep a steady monthly income.",
    links: [{ label: "Senior Citizens' Savings Scheme", note: "Safe, regular interest", href: "https://www.indiapost.gov.in" }],
  },
};
const GENERAL: Track = {
  title: "Your plan",
  blurb: "Build an emergency fund first, then save tax and invest.",
  links: [{ label: "Find schemes for you", note: "Government schemes by eligibility", href: "https://www.myscheme.gov.in" }],
};

/** A role-specific strip at the top of the dashboard, plus progress towards the monthly savings target they gave us. */
export function RoleSpotlight({ userId, savedThisMonth }: { userId: string; savedThisMonth: number }) {
  const { t } = useT();
  const { data } = useAsync(useCallback(() => api.profile(userId), [userId]), [userId]);
  const a = data?.answers;
  if (!a?.role) return null;
  const trackKey = TRACKS[a.role] ? a.role : "General";
  const track = TRACKS[a.role] ?? GENERAL;
  const target = Number(a.save_target) || 0;
  const pct = target > 0 ? Math.max(0, Math.min(100, (savedThisMonth / target) * 100)) : 0;
  const earns = Number(a.monthly_income) || 0;

  return (
    <section className="rounded-card bg-sage p-5 text-ink shadow-sm sm:p-6">
      <h2 className="font-display text-xl font-semibold">
        {a.role === "Other" && a.role_other ? t("r.plan").replace("{r}", a.role_other) : t("r." + trackKey, track.title)}
        {a.savings_goal && <span className="ml-2 text-sm font-normal text-ink/70">{t("r.aim")} {a.savings_goal}</span>}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-ink/75">
        {t("r." + trackKey + ".b", track.blurb)}
        {earns === 0 && a.role === "Student" && " " + t("r.student_note")}
      </p>

      {target > 0 && (
        <div className="mt-4 max-w-md">
          <div className="flex justify-between text-xs">
            <span>{t("r.saved")} {formatCurrency(Math.max(0, savedThisMonth))}</span>
            <span>{t("r.target")} {formatCurrency(target)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/60">
            <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {track.links.map((l) => (
          <a key={l.label} href={safeHref(l.href)} target="_blank" rel="noreferrer" className="rounded-2xl bg-white/60 p-3 transition hover:bg-white">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {l.label} <ExternalLink className="size-3.5" />
            </p>
            <p className="mt-0.5 text-xs text-ink/70">{l.note}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
