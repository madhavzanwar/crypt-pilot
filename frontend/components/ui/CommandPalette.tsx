"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  LayoutDashboard,
  ReceiptText,
  PieChart,
  Target,
  Users,
  Bot,
  SlidersHorizontal,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Coins,
  User,
  PlusCircle,
  X,
  Keyboard,
  ListChecks,
  LineChart,
  ShieldAlert,
  ScanSearch,
  Gavel,
  Network,
  Link2,
  ScanText,
  Database,
  UserRound,
} from "lucide-react";
import { useUserId } from "@/lib/hooks";
import { useT } from "@/components/i18nLocal";
import { DEMO_PERSONAS, isDemoUserId, setUserId } from "@/lib/user";
import { useCurrency, CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { triggerConfetti } from "@/components/ui/Confetti";

interface CommandItem {
  id: string;
  group: "navigation" | "actions" | "personas" | "currency";
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  badge?: string;
  onSelect: () => void;
}

type Icon = React.ComponentType<{ className?: string }>;
/** [key, href, icon, shortcut]: labels come from components/i18nLocal.ts as cmd.nav.<key> and cmd.nav.<key>.sub. */
const NAV_ENTRIES: [string, string, Icon, string?][] = [
  ["dashboard", "/dashboard", LayoutDashboard, "G D"],
  ["transactions", "/transactions", ReceiptText, "G T"],
  ["budgets", "/budgets", PieChart, "G B"],
  ["goals", "/goals", Target, "G G"],
  ["household", "/household", Users, "G H"],
  ["copilot", "/copilot", Bot, "G C"],
  ["simulate", "/simulate", SlidersHorizontal, "G S"],
  ["forecast", "/forecast-risk", LineChart],
  ["plan", "/plan", ListChecks, "G N"],
  ["tax", "/scenarios", FileSpreadsheet, "G X"],
  ["statement", "/statement", FileText, "G P"],
  ["security", "/security", ShieldCheck, "G L"],
  ["finsec", "/financial-security", ShieldAlert],
  ["wallet", "/wallet-guard", ShieldCheck],
  ["credits", "/credits", Coins],
  ["evidence", "/evidence-room", ScanSearch],
  ["council", "/council", Gavel],
  ["twin", "/twin", Network],
  ["connect", "/connect", Link2],
  ["upload", "/upload", ScanText],
  ["mydata", "/my-data", Database],
  ["profile", "/profile", UserRound],
];
/** [key, icon, badge, href]: no href means the confetti easter egg. */
const ACTION_ENTRIES: [string, Icon, string, string?][] = [
  ["review", ReceiptText, "Action", "/transactions"],
  ["budget", PlusCircle, "Action", "/budgets"],
  ["invite", Users, "Action", "/household"],
  ["confetti", Sparkles, "Fun"],
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { t } = useT();
  const userId = useUserId();
  const { currency, setCurrency } = useCurrency();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut listener: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Custom event trigger
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("finpilot:open-command-palette", handleOpen);
    return () => window.removeEventListener("finpilot:open-command-palette", handleOpen);
  }, []);

  // Auto focus input when opened
  useEffect(() => {
    if (open) {
      // Reset the palette each time it opens (open is toggled from several places).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      ...NAV_ENTRIES.map(
        ([key, href, icon, shortcut]): CommandItem => ({
          id: `nav-${key}`,
          group: "navigation",
          label: t(`cmd.nav.${key}`),
          sublabel: t(`cmd.nav.${key}.sub`),
          icon,
          shortcut,
          onSelect: () => router.push(href),
        }),
      ),
      ...ACTION_ENTRIES.map(
        ([key, icon, badge, href]): CommandItem => ({
          id: `action-${key}`,
          group: "actions",
          label: t(`cmd.act.${key}`),
          sublabel: t(`cmd.act.${key}.sub`),
          icon,
          badge,
          onSelect: href ? () => router.push(href) : () => triggerConfetti({ count: 80 }),
        }),
      ),
    ];

    // Personas
    if (isDemoUserId(userId)) {
      DEMO_PERSONAS.forEach((p) => {
        items.push({
          id: `persona-${p.id}`,
          group: "personas",
          label: `${t("cmd.switchPersona")} ${p.label}`,
          sublabel: p.id === "demo-priya" ? "Bengaluru • ₹1L/mo" : p.id === "demo-arjun" ? "Mumbai • ₹180k/mo" : "Pune • ₹52k/mo",
          icon: User,
          badge: userId === p.id ? "Active" : undefined,
          onSelect: () => setUserId(p.id),
        });
      });
    }

    // Currencies
    (Object.keys(CURRENCIES) as CurrencyCode[]).forEach((code) => {
      const c = CURRENCIES[code];
      items.push({
        id: `currency-${code}`,
        group: "currency",
        label: `${t("cmd.setCurrency")} ${c.code} (${c.symbol}) — ${c.label}`,
        sublabel: `${t("cmd.rate")}: ${c.rateFromINR} × INR`,
        icon: Coins,
        badge: currency === code ? "Selected" : undefined,
        onSelect: () => setCurrency(code),
      });
    });

    return items;
  }, [router, userId, currency, setCurrency, t]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase().trim();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Handle keyboard navigation within list
  const handleKeyDownInMenu = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].onSelect();
        setOpen(false);
      }
    }
  };

  const groupLabels: Record<string, string> = {
    navigation: t("cmd.group.navigation"),
    actions: t("cmd.group.actions"),
    personas: t("cmd.group.personas"),
    currency: t("cmd.group.currency"),
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-sage/60 backdrop-blur-md transition-opacity"
            aria-hidden="true"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative w-full max-w-xl rounded-2xl bg-paper shadow-2xl border border-mist overflow-hidden z-10 flex flex-col max-h-[75vh]"
            role="dialog"
            aria-modal="true"
            aria-label={t("cmd.aria")}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-mist bg-paper">
              <Search className="h-5 w-5 text-pewter shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder={t("cmd.placeholder")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDownInMenu}
                className="w-full bg-transparent text-sm sm:text-base text-ink placeholder:text-pewter focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("cmd.clear")}
                  className="text-pewter hover:text-ink p-1 rounded hover:bg-fog cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-pewter bg-fog px-2 py-0.5 rounded border border-mist">
                <span>ESC</span>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-black/[0.04]">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-pewter">
                  {t("cmd.none")} &quot;{query}&quot;
                </div>
              ) : (
                ["navigation", "actions", "personas", "currency"].map((grp) => {
                  const grpItems = filteredItems.filter((i) => i.group === grp);
                  if (grpItems.length === 0) return null;

                  return (
                    <div key={grp} className="py-1.5 first:pt-0">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-pewter">
                        {groupLabels[grp]}
                      </div>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {grpItems.map((item) => {
                          const itemIndex = filteredItems.indexOf(item);
                          const isSelected = itemIndex === selectedIndex;
                          const Icon = item.icon;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                item.onSelect();
                                setOpen(false);
                              }}
                              onMouseEnter={() => setSelectedIndex(itemIndex)}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                isSelected ? "bg-fog text-ink font-semibold" : "text-graphite hover:bg-fog/60"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors shrink-0 ${
                                    isSelected
                                      ? "bg-[#172554] text-white border-[#172554] shadow-xs"
                                      : "bg-paper text-pewter border-mist"
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="truncate">
                                  <span className="text-xs sm:text-sm text-ink block truncate">
                                    {item.label}
                                  </span>
                                  {item.sublabel && (
                                    <span className="text-[11px] text-pewter block truncate font-normal">
                                      {item.sublabel}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {item.badge && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                                      item.badge === "Active" || item.badge === "Selected"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-ember-soft text-ember border-ember/20"
                                    }`}
                                  >
                                    {t(`cmd.badge.${item.badge}`, item.badge)}
                                  </span>
                                )}
                                {item.shortcut && (
                                  <span className="text-[10px] font-mono font-semibold text-pewter bg-paper px-1.5 py-0.5 rounded border border-mist">
                                    {item.shortcut}
                                  </span>
                                )}
                                {isSelected && <ArrowRight className="h-3.5 w-3.5 text-[#172554]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2.5 bg-fog/80 border-t border-mist flex items-center justify-between text-[11px] text-pewter">
              <div className="flex items-center gap-2">
                <Keyboard className="h-3.5 w-3.5" />
                <span>{t("cmd.hint")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink">FinPilot</span>
                <span>{t("cmd.hub")}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
