"use client";

import { Languages } from "lucide-react";
import { LANGS, setLang, useT, type Lang } from "@/lib/i18n";

/** Picks the site language. Choice is remembered in this browser. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, t } = useT();
  return (
    <label className={`flex items-center gap-1.5 rounded-full border border-mist bg-paper px-2.5 py-1 text-xs text-graphite max-md:min-h-11 focus-within:ring-2 focus-within:ring-ring/60 ${className}`}>
      <Languages className="size-3.5" aria-hidden />
      <span className="sr-only">{t("lang.label")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="cursor-pointer bg-transparent text-ink outline-none" aria-label={t("lang.label")}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
