"use client";

import { useState } from "react";
import { CreditCard, Wallet } from "lucide-react";
import { useCredits } from "@/lib/crypto/useCredits";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { CryptoInvoice } from "./CryptoInvoice";
import { DodoCheckout } from "./DodoCheckout";
import { PackCard } from "./PackCard";
import { TestModeBanner } from "./TestModeBanner";

/** Balance + packs + the two payment paths. `compact` is the drawer layout. Shared by the drawer and /credits. */
export function CreditsPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const { balance, packs, loading, unavailable, refetch } = useCredits();
  const [selected, setSelected] = useState<string | null>(null);
  const pack = packs.find((p) => p.id === selected) ?? packs[0];

  return (
    <div className="grid gap-5">
      <TestModeBanner />

      <div>
        <p className="text-sm text-graphite">{t("cr.balance", "Your balance")}</p>
        {loading && balance === null ? (
          <Skeleton className="mt-1.5 h-10 w-28" />
        ) : (
          <p className="mt-1 flex items-baseline gap-2" aria-live="polite">
            <span className={cn("font-display leading-none font-semibold text-ink tabular-nums", compact ? "text-4xl" : "text-5xl")}>{balance ?? "-"}</span>
            <span className="text-sm text-graphite">{t("cr.credits", "credits")}</span>
          </p>
        )}
      </div>

      {unavailable && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-surface bg-rose-badge/10 px-3 py-2 text-sm text-rose-badge">
          <span>The credits service is not reachable right now.</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {loading && packs.length === 0 && !unavailable && (
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {pack && (
        <>
          <section aria-labelledby={compact ? "cr-packs-d" : "cr-packs-p"}>
            <h2 id={compact ? "cr-packs-d" : "cr-packs-p"} className="mb-2 text-xs font-medium tracking-wide text-pewter uppercase">
              {t("cr.packs", "Credit packs")}
            </h2>
            <div className={cn("grid gap-3", compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
              {packs.map((p) => (
                <PackCard key={p.id} pack={p} selected={p.id === pack.id} onSelect={() => setSelected(p.id)} compact={compact} />
              ))}
            </div>
          </section>

          <Tabs defaultValue="card" className="gap-3">
            <TabsList className="h-auto w-full rounded-full bg-fog p-1">
              <TabsTrigger value="card" className="gap-1.5 rounded-full px-3 py-1.5 data-[state=active]:bg-lime data-[state=active]:text-ink data-[state=active]:shadow-none">
                <CreditCard /> Card (Dodo, test mode)
              </TabsTrigger>
              <TabsTrigger value="wallet" className="gap-1.5 rounded-full px-3 py-1.5 whitespace-normal data-[state=active]:bg-lime data-[state=active]:text-ink data-[state=active]:shadow-none">
                <Wallet /> Cake Wallet (BTC testnet / XMR demo)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="card">
              <DodoCheckout pack={pack} />
            </TabsContent>
            <TabsContent value="wallet">
              <CryptoInvoice key={pack.id} pack={pack} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
