"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PrivacyMask } from "@/components/ui/PrivacyMask";
import { formatAxisCurrency } from "@/components/ui/money";
import { useCurrency } from "@/lib/currency";
import { CurrencySelector } from "@/components/ui/CurrencySelector";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ShortcutBadge } from "@/components/ui/ShortcutBadge";
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

// Credits pill + drawer (and the QR code library behind it) load after the shell instead of shipping in every route's first load.
const CreditsPill = dynamic(() => import("@/components/crypto/credits/CreditsPill"), {
  ssr: false,
  loading: () => <span aria-hidden className="inline-block h-8 w-16 rounded-full border border-mist bg-white max-md:h-11" />,
});

const PERSONA_DETAILS: Record<string, { city: string; monthlyIncome: number }> = {
  "demo-priya": { city: "Bengaluru", monthlyIncome: 100000 },
  "demo-arjun": { city: "Mumbai", monthlyIncome: 180000 },
  "demo-meera": { city: "Pune", monthlyIncome: 52000 },
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
            title={details ? `${details.city} · ${formatAxisCurrency(details.monthlyIncome)}/mo` : undefined}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setUserId(persona.id)}
            className={cn(
              "relative px-3 py-1.5 text-xs font-medium cursor-pointer rounded-full transition-colors whitespace-nowrap flex items-center gap-1.5 max-md:min-h-11",
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
  const { currency } = useCurrency();
  const current = NAV_GROUPS.flatMap((g) => g.links).find((l) => pathname?.startsWith(l.href));
  useEffect(() => prefetchCore(userId), [userId]);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <a
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            const main = document.getElementById("main-content");
            main?.focus();
            main?.scrollIntoView({ block: "start" });
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-lime"
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
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1 bg-background/70 px-3 backdrop-blur-md sm:gap-2 sm:px-4">
            <SidebarTrigger className="-ml-1 max-md:size-11" />
            <Separator orientation="vertical" className="mr-1 hidden data-[orientation=vertical]:h-4 sm:block" />
            <Breadcrumb className="min-w-0 flex-1 md:flex-none md:shrink-0">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className={cn("block truncate font-display font-semibold text-ink", isDashboard ? "text-xl sm:text-3xl lg:text-4xl" : "text-lg sm:text-xl lg:text-2xl")}>{current?.label ?? "FinPilot"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("finpilot:open-command-palette"))}
                className="hidden h-9 w-56 items-center gap-2 rounded-xl bg-white px-3 text-sm text-muted-foreground shadow-sm xl:flex"
                title="Search"
                aria-label="Open search"
              >
                <Search className="size-4" aria-hidden />
                <span>Search...</span>
                <ShortcutBadge />
              </button>
              <Button variant="outline" size="icon" className="xl:hidden" onClick={() => window.dispatchEvent(new CustomEvent("finpilot:open-command-palette"))} aria-label="Open search">
                <Search className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setHidden((h) => !h)}
                aria-label={hidden ? "Show amounts" : "Hide amounts"}
                aria-pressed={hidden}
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
              <div className="max-md:[&_button]:h-11 max-md:[&_button]:min-w-11">
                <CreditsPill />
              </div>
              <NotificationBell userId={userId} large={isDashboard} />
            </div>
          </header>

          {/* Re-keyed on currency so every figure on the page re-renders in the newly chosen currency. */}
          <main
            id="main-content"
            tabIndex={-1}
            key={currency}
            className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] outline-none sm:px-6 sm:py-5 md:pb-6 lg:px-8"
          >
            {children}
          </main>
        </SidebarInset>

        <MobileBottomNav />
        <PrivacyMask active={hidden} />
        <CommandPalette />
        <ConfettiCanvas />
      </SidebarProvider>
    </TooltipProvider>
  );
}
