"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/components/i18nMoney";
import { cn } from "@/lib/utils";

const KEY = "finpilot:plan_advanced_open";
const listeners = new Set<() => void>();
let memory: boolean | null = null; // survives blocked storage for the rest of the visit

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(open: boolean) {
  memory = open;
  try {
    window.sessionStorage.setItem(KEY, open ? "1" : "0");
  } catch {
    // blocked storage: the in-memory value still holds for this visit
  }
  listeners.forEach((l) => l());
}

/** Collapsed-by-default disclosure for technical engine settings. The panel stays mounted so edited values are kept while closed. */
export function AdvancedSettings({ children }: { children: ReactNode }) {
  const { t } = useT();
  const id = useId();
  const open = useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), read, () => false);
  return (
    <div className="w-full border-t border-black/[0.06] pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => write(!open)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-chip px-1 text-sm font-semibold text-graphite hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        {t("pl.adv.title")}
      </button>
      <div id={id} role="group" aria-label={t("pl.adv.title")} hidden={!open} className="mt-2 flex flex-col gap-3">
        <p className="text-xs text-pewter">{t("pl.adv.hint")}</p>
        {children}
      </div>
    </div>
  );
}
