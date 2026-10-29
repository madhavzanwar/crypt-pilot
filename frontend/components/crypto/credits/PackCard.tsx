"use client";

import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { Check } from "lucide-react";
import type { CreditPack } from "@/lib/crypto/api";
import { cn } from "@/lib/utils";

export const formatUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** One credit pack as a toggle button (aria-pressed). Selected = lime border and tint. */
export function PackCard({
  pack,
  selected,
  onSelect,
  compact = false,
}: {
  pack: CreditPack;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const { t } = useT();
  const price = formatUsd(pack.priceUsd);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${pack.label}: ${pack.credits} ${t("cr.credits", "credits")} · ${price}, ${t("cr.testword", "test mode")}`}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-start gap-1.5 rounded-surface border bg-white p-4 text-left transition duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        selected ? "border-lime-dark bg-tint-lime shadow-sm" : "border-mist hover:border-lime-dark/60 hover:bg-fog",
        !compact && "p-5",
      )}
    >
      {selected && (
        <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-lime text-ink">
          <Check className="size-3.5" aria-hidden />
        </span>
      )}
      <span className="text-xs font-medium tracking-wide text-pewter uppercase">{pack.label}</span>
      <span className={cn("font-display leading-none font-semibold text-ink tabular-nums", compact ? "text-3xl" : "text-5xl")}>{pack.credits}</span>
      <span className="text-sm text-graphite tabular-nums">
        {t("cr.credits", "credits")} · {price} <span className="text-pewter">({t("cr.testshort", "test")})</span>
      </span>
    </button>
  );
}
