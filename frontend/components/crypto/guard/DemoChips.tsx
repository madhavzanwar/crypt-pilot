"use client";

import { useDemoWallets, middleEllipsis } from "@/lib/crypto/demoWallets";
import { VERDICT_META } from "@/lib/crypto/verdict";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useGuardT, verdictWord } from "./copy";

/**
 * "Try an example": chips from GET /api/crypto/demo-wallets. Clicking fills the field (it does not run the check).
 * Layout note: addresses are truncated with a middle ellipsis and every chip is `min-w-0 max-w-full`, so a long
 * bech32 example can never push the page sideways on a phone.
 */
export default function DemoChips({ onPick, selected, disabled }: { onPick: (address: string) => void; selected?: string; disabled?: boolean }) {
  const { g, uiLang } = useGuardT();
  const { wallets, loading, error } = useDemoWallets(4);
  if (!loading && (error || wallets.length === 0)) return null;
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-graphite">{g("wg.examples")}</p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {loading
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-40 rounded-full" />)
          : wallets.map((w) => {
              const on = selected === w.address;
              const meta = VERDICT_META[w.expected];
              const Icon = meta.icon;
              const label = w.note.length <= 28 ? w.note : verdictWord(uiLang, w.expected);
              return (
                <button
                  key={w.address}
                  type="button"
                  disabled={disabled}
                  title={`${w.note}: ${w.address}`}
                  aria-pressed={on}
                  onClick={() => onPick(w.address)}
                  className={cn(
                    "inline-flex min-h-10 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-lime-dark bg-lime text-ink shadow-md" : "border-black/[0.08] bg-white text-graphite hover:bg-fog hover:text-ink",
                  )}
                >
                  <Icon className={cn("size-4 flex-none", meta.text)} aria-hidden />
                  <span className="min-w-0 flex-shrink truncate font-semibold">{label}</span>
                  <span className="tnum min-w-0 flex-shrink-[2] truncate font-mono text-[11px] opacity-70">{middleEllipsis(w.address, 6, 5)}</span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
