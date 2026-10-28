"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { OPEN_CREDITS_EVENT } from "@/lib/crypto/creditsEvents";
import { useCredits } from "@/lib/crypto/useCredits";
import { CreditsDrawer } from "./CreditsDrawer";
import { registerCreditsHost } from "./openCredits";

/**
 * Small balance pill (tabular numerals; "-" if the credits service is down). Click opens the credits drawer, which also
 * opens on the `cryptpilot:open-credits` window event (see openCreditsDrawer()). Refetches on `cryptpilot:credits-changed` and tab focus.
 */
export default function CreditsPill() {
  const { balance, loading } = useCredits();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CREDITS_EVENT, onOpen);
    const unregister = registerCreditsHost();
    return () => {
      window.removeEventListener(OPEN_CREDITS_EVENT, onOpen);
      unregister();
    };
  }, []);

  const shown = balance === null ? "-" : String(balance);
  const label = balance === null ? (loading ? "Loading credits balance" : "Credits balance unavailable. Open credits") : `${balance} credits. Open credits`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title="Credits (test mode)"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-mist bg-white px-3 text-sm font-semibold text-ink shadow-xs transition outline-none hover:bg-fog focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <Coins className="size-4 text-ember-dark" aria-hidden />
        <span className="tabular-nums">{shown}</span>
      </button>
      <CreditsDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
