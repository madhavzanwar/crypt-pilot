"use client";

import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { FinPilotLogo } from "@/components/FinPilotLogo";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { useCredits } from "@/lib/crypto/useCredits";
import { TestModeBanner } from "./TestModeBanner";

const POLL_MS = 3000;
const POLL_TIMES = 10;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-3xl bg-white p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] sm:p-8">
        <Link href="/dashboard" aria-label="FinPilot home">
          <FinPilotLogo variant="horizontal" size={28} showWordmark />
        </Link>
        {children}
      </div>
    </main>
  );
}

/** /credits/cancelled: Dodo checkout was abandoned or failed. Public on purpose (no FinPilot login needed to land here). */
export function CreditsCancelled({ failed = false }: { failed?: boolean }) {
  const { t } = useT();
  return (
    <Frame>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
          <CircleX className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{failed ? t("cr.ret.failed", "Payment did not go through") : t("cr.ret.cancelled", "Checkout cancelled")}</h1>
          <p className="mt-1 text-sm text-graphite">{t("cr.ret.nocharge", "No payment was made and nothing was charged. Your balance is unchanged.")}</p>
        </div>
      </div>
      <TestModeBanner />
      <Button asChild variant="lime" size="lg" className="w-full">
        <Link href="/credits">{t("cr.ret.back", "Back to credits")}</Link>
      </Button>
    </Frame>
  );
}

/** /credits/success: calm confirmation. The Dodo webhook can land a moment after the redirect, so refetch for ~30 s. */
export function CreditsSuccess() {
  const { t } = useT();
  const status = (useSearchParams().get("status") ?? "").toLowerCase();
  const failed = status === "failed" || status === "cancelled" || status === "canceled";
  const confirmed = ["succeeded", "success", "paid", "completed"].includes(status);
  const { balance, unavailable, refetch } = useCredits();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (failed) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTries(n);
      void refetch();
      if (n >= POLL_TIMES) window.clearInterval(id);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [failed, refetch]);

  if (failed) return <CreditsCancelled failed />;
  const waiting = tries < POLL_TIMES;
  return (
    <Frame>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-leaf/15 text-leaf">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{confirmed ? t("cr.ret.thanks", "Thank you") : t("cr.ret.checking", "Checking your payment")}</h1>
          <p className="mt-1 text-sm text-graphite">
            {confirmed
              ? t("cr.ret.came", "Your test-mode payment came back from Dodo. Credits are added when Dodo confirms it, which can take a few seconds. No real charge was made.")
              : t("cr.ret.notyet", "We have not had a confirmed payment status from Dodo yet. Credits are added only once it confirms, which can take a few seconds. No real charge was made.")}
          </p>
        </div>
      </div>
      <div aria-live="polite">
        <p className="text-sm text-graphite">{t("cr.ret.balance", "Balance")}</p>
        {balance === null && !unavailable ? (
          <Skeleton className="mt-1.5 h-10 w-28" />
        ) : (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-5xl leading-none font-semibold text-ink tabular-nums">{balance ?? "-"}</span>
            <span className="text-sm text-graphite">{t("cr.credits", "credits")}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-pewter">
          {unavailable ? t("cr.ret.unreach", "The credits service is not reachable right now. Try refresh in a moment.") : waiting ? t("cr.ret.waiting", "Checking for confirmation...") : t("cr.ret.refreshLater", "If the balance has not changed, refresh in a minute.")}
        </p>
      </div>
      <TestModeBanner />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="lime" size="lg" className="flex-1">
          <Link href="/dashboard">{t("cr.ret.continue", "Continue to FinPilot")}</Link>
        </Button>
        <Button variant="outline" size="lg" onClick={() => void refetch()}>
          {t("cr.ret.refresh", "Refresh balance")}
        </Button>
      </div>
    </Frame>
  );
}
