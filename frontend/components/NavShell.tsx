"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "@/components/MobileBottomNav";

// Credits pill + drawer (and the QR lib behind them) load after first paint instead of shipping in every route (BUG-042).
const CreditsPill = dynamic(() => import("@/components/crypto/credits/CreditsPill"), {
  ssr: false,
  loading: () => <span aria-hidden className="inline-block h-9 w-20" />,
});

/** Text that looks like a money amount in any supported currency. */
const AMOUNT_TEXT = /(?:[₹$€£]|\b(?:AED|SGD|INR|USD|EUR|GBP)\b)\s*[-−+]?\s*\d|\d\s*(?:AED|SGD|€)/;

/**
 * Privacy eye (BUG-059): marks every element whose own text is a money amount so one CSS rule can blur it, not only the
 * `.tnum` ones. Runs only while amounts are hidden.
 */
function useAmountMask(hidden: boolean) {
  useEffect(() => {
    if (!hidden) return;
    const style = document.createElement("style");
    style.textContent = ".hide-amounts [data-amt]{filter:blur(7px)}";
    document.head.appendChild(style);
    const mark = (root: Node) => {
      const base = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
      if (!base) return;
      const w = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (el && !el.closest("script,style,input,textarea,select") && AMOUNT_TEXT.test(n.nodeValue ?? "")) el.setAttribute("data-amt", "");
      }
    };
    mark(document.body);
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === "characterData") mark(r.target);
        else r.addedNodes.forEach(mark);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      style.remove();
      document.querySelectorAll("[data-amt]").forEach((e) => e.removeAttribute("data-amt"));
    };
  }, [hidden]);
}

/** "⌘ K" on Apple platforms, "Ctrl K" elsewhere (BUG-058). */
function useShortcutLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K"),
    () => "Ctrl K",
  );
}
import { NotificationBell } from "@/components/NotificationBell";
import { CurrencySelector } from "@/components/ui/CurrencySelector";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ConfettiCanvas } from "@/components/ui/Confetti";
import { AppSidebar, NAV_GROUPS } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/shadcn/sidebar";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import { Separator } from "@/components/shadcn/separator";
import { Button } from "@/components/shadcn/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/shadcn/breadcrumb";
import { useUserId } from "@/lib/hooks";
import { prefetchCore } from "@/lib/api";
import { DEMO_PERSONAS, isDemoUserId, setUserId } from "@/lib/user";

const PERSONA_DETAILS: Record<string, { city: string; tag: string }> = {
  "demo-priya": { city: "Bengaluru", tag: "₹1L/mo" },
  "demo-arjun": { city: "Mumbai", tag: "₹180k/mo" },
  "demo-meera": { city: "Pune", tag: "₹52k/mo" },
};

/** Segmented control for switching between the seeded demo personas */
function PersonaSwitcher() {
  const userId = useUserId();
  // Signed-in users only see their own data -- no demo personas.
  if (!isDemoUserId(userId)) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Demo persona"
      className="flex items-center gap-1 rounded-full border border-mist bg-paper/70 p-1 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
    >
      {DEMO_PERSONAS.map((persona) => {
        const active = userId === persona.id;
        const details = PERSONA_DETAILS[persona.id];
        return (
          <button
            key={persona.id}
            title={details ? `${details.city} · ${details.tag}` : undefined}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setUserId(persona.id)}
            className={cn(
              "relative px-3 py-1.5 max-md:min-h-11 text-xs font-medium cursor-pointer rounded-full transition-colors whitespace-nowrap flex items-center gap-1.5",
              active ? "text-ink font-semibold" : "text-graphite hover:text-ink"
            )}
          >
            {active && (
              <motion.div
                layoutId="active-persona-pill"
                className="absolute inset-0 rounded-full bg-paper shadow-[0_1px_4px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-mist"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-ember" : "bg-steel/50"
                )}
              />
              <span>{persona.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const userId = useUserId();
  const isDashboard = pathname?.startsWith("/dashboard") ?? false;
  const [hidden, setHidden] = useState(false);
  // formatCurrency() reads the selected currency from storage; remount the page when the user switches so every figure re-renders (BUG-023)
  const [currencyEpoch, setCurrencyEpoch] = useState(0);
  useEffect(() => {
    const bump = () => setCurrencyEpoch((n) => n + 1);
    window.addEventListener("finpilot:currency-change", bump);
    return () => window.removeEventListener("finpilot:currency-change", bump);
  }, []);
  const shortcut = useShortcutLabel();
  useAmountMask(hidden);
  const current = NAV_GROUPS.flatMap((g) => g.links).find((l) => pathname?.startsWith(l.href));
  useEffect(() => prefetchCore(userId), [userId]);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to main content
        </a>
        <AppSidebar
          footer={
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <LanguageSwitcher />
                <CurrencySelector />
              </div>
              <div className="2xl:hidden">
                <PersonaSwitcher />
              </div>
            </div>
          }
        />
        <SidebarInset className="min-w-0 overflow-x-hidden bg-transparent">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 bg-background/70 px-3 backdrop-blur-md sm:px-4">
            <SidebarTrigger className="-ml-1 size-11 md:size-9" />
            <Separator orientation="vertical" className="mr-1 max-sm:hidden data-[orientation=vertical]:h-4" />
            <Breadcrumb className="min-w-0 flex-1 md:flex-none">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className={cn("truncate font-display font-semibold text-ink", isDashboard ? "text-lg sm:text-4xl" : "text-base sm:text-2xl")}>{current?.label ?? "FinPilot"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("finpilot:open-command-palette"))}
                className="hidden h-9 w-56 items-center gap-2 rounded-xl bg-white px-3 text-sm text-graphite shadow-sm xl:flex"
                title={`Search (${shortcut})`}
                aria-label="Open search"
              >
                <Search className="size-4" />
                <span>Search...</span>
                <kbd className="ml-auto whitespace-nowrap rounded border border-mist bg-fog px-1.5 py-0.5 font-mono text-[10px] font-semibold text-graphite">{shortcut}</kbd>
              </button>
              <Button variant="outline" size="icon" className="max-md:size-11 xl:hidden" onClick={() => window.dispatchEvent(new CustomEvent("finpilot:open-command-palette"))} aria-label="Open search">
                <Search className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="max-md:size-11"
                onClick={() => setHidden((h) => { document.documentElement.classList.toggle("hide-amounts", !h); return !h; })}
                aria-label={hidden ? "Show amounts" : "Hide amounts"}
                title={hidden ? "Show amounts" : "Hide amounts"}
              >
                {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
              <div className="hidden items-center gap-1.5 lg:flex">
                <LanguageSwitcher />
                <CurrencySelector />
              </div>
              <div className="hidden 2xl:block">
                <PersonaSwitcher />
              </div>
              <CreditsPill />
              <NotificationBell userId={userId} large={isDashboard} />
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="mx-auto outline-none w-full max-w-[1600px] min-w-0 flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-6 sm:px-6 sm:py-5 lg:px-8">
            <div key={currencyEpoch} className="contents">
              {children}
            </div>
          </main>
        </SidebarInset>

        <MobileBottomNav />
        <CommandPalette />
        <ConfettiCanvas />
      </SidebarProvider>
    </TooltipProvider>
  );
}
