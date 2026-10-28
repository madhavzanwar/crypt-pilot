"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { api, messageFor } from "@/lib/crypto/api";
import type { CreditPack } from "@/lib/crypto/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/shadcn/button";
import { formatUsd } from "./PackCard";

/** "Card (Dodo, test mode)": POST checkout, then leave for the Dodo test checkout page. The webhook adds the credits. */
export function DodoCheckout({ pack }: { pack: CreditPack }) {
  const { t, lang } = useT();
  const [state, setState] = useState<"idle" | "busy" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setState("busy");
    setError(null);
    try {
      const { url } = await api.checkout(pack.id);
      if (!/^https:\/\//i.test(url)) throw new Error("bad_checkout_url");
      setState("redirecting");
      window.location.href = url;
    } catch (e) {
      setState("idle");
      setError(e instanceof Error && e.message === "bad_checkout_url" ? "Checkout returned an unexpected link, so we stopped." : messageFor(e, lang === "hi" ? "hi" : "en").message);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-ink tabular-nums">
        {pack.label}: {pack.credits} {t("cr.credits", "credits")} · {formatUsd(pack.priceUsd)}
      </p>
      <p className="text-sm text-graphite">
        {t("cr.card_note", "You pay on Dodo's test-mode checkout page. Test mode, no real charge: nothing is billed to a real card.")}
      </p>
      {error && (
        <p role="alert" className="rounded-surface bg-rose-badge/10 px-3 py-2 text-sm text-rose-badge">
          {error}
        </p>
      )}
      <Button variant="lime" size="lg" onClick={go} disabled={state !== "idle"} className="w-full">
        {state === "idle" ? <CreditCard /> : <Loader2 className="animate-spin" />}
        {state === "redirecting" ? t("cr.redirecting", "Opening Dodo test checkout") : t("cr.pay_card", "Pay by card (test mode)")}
      </Button>
    </div>
  );
}
