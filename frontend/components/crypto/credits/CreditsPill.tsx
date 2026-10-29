"use client";

import { useEffect, useRef, useState } from "react";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Whatever had focus when the drawer opened (the pill, or e.g. a "Get credits" button elsewhere): focus goes back there. */
  const opener = useRef<HTMLElement | null>(null);
  const openDrawer = () => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : buttonRef.current;
    setOpen(true);
  };

  useEffect(() => {
    const onOpen = () => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : buttonRef.current;
      setOpen(true);
    };
    window.addEventListener(OPEN_CREDITS_EVENT, onOpen);
    const unregister = registerCreditsHost();
    return () => {
      window.removeEventListener(OPEN_CREDITS_EVENT, onOpen);
      unregister();
    };
  }, []);

  const shown = balance === null ? "-" : String(balance);
  // The visible text is the number, so the accessible name starts with it ("100 credits"): label and visible text agree.
  const label = balance === null ? (loading ? "Loading credits balance" : "Credits balance unavailable") : `${balance} credits`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openDrawer}
        aria-label={label}
        aria-haspopup="dialog"
        title="Credits (test mode)"
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-mist bg-white px-3 text-sm font-semibold text-ink shadow-xs transition outline-none hover:bg-fog focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <Coins className="size-4 text-ember-dark" aria-hidden />
        <span className="tabular-nums">{shown}</span>
      </button>
      <CreditsDrawer open={open} onOpenChange={setOpen} returnFocusTo={() => opener.current ?? buttonRef.current} />
    </>
  );
}
