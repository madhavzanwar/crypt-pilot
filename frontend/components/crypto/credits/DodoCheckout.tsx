"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { api, messageFor } from "@/lib/crypto/api";
import type { CreditPack } from "@/lib/crypto/api";
import { toRequestLang } from "@/lib/crypto/lang";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { Button } from "@/components/shadcn/button";
import { formatUsd } from "./PackCard";

/** "Card (Dodo, test mode)": POST checkout, then leave for the Dodo test checkout page. The webhook adds the credits. */
/** The checkout link must be https on Dodo's own domain (test or live): a compromised backend must not be able to redirect elsewhere. */
function isDodoCheckoutUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "dodopayments.com" || u.hostname.endsWith(".dodopayments.com"));
  } catch {
    return false;
  }
}

export function DodoCheckout({ pack }: { pack: CreditPack }) {
  const { t, lang } = useT();
  const [state, setState] = useState<"idle" | "busy" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);

  // Back from Dodo restores this page from the bfcache with state "redirecting": reset so the button works again (BUG-030).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setState("idle");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function go() {
    setState("busy");
    setError(null);
    try {
      const { url } = await api.checkout(pack.id);
      if (!isDodoCheckoutUrl(url)) throw new Error("bad_checkout_url");
      setState("redirecting");
      window.location.href = url;
    } catch (e) {
      setState("idle");
      setError(e instanceof Error && e.message === "bad_checkout_url" ? "Checkout returned an unexpected link, so we stopped." : messageFor(e, toRequestLang(lang)).message);
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
