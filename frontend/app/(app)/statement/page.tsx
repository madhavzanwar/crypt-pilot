"use client";

import { useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { DEMO_PERSONAS, isDemoUserId, setUserId } from "@/lib/user";
import { ExecutiveStatement } from "@/components/statement/ExecutiveStatement";
import { StatementAnchorPanel } from "@/components/statement/StatementAnchorPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HealthScoreSkeleton, ListItemSkeleton } from "@/components/ui/Skeleton";
import { Printer, ArrowLeft, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StatementPage() {
  const userId = useUserId();

  const fetchStatementData = useCallback(async () => {
    const dashPromise = api.dashboard(userId);
    const accPromise = api.accounts(userId).catch(() => []);
    const txnPromise = api.transactions(userId, { page: 1, page_size: 200 }).then((r) => r.items).catch(() => []);
    const [dashboard, accounts, transactions] = await Promise.all([dashPromise, accPromise, txnPromise]);
    return { dashboard, accounts, transactions };
  }, [userId]);

  const { data, error, loading, reload } = useAsync(fetchStatementData, [userId]);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-20 min-w-0 max-w-full">
      {/* ─────────────────────────────────────────────────────────────
          SCREEN-ONLY FLOATING ACTION & CONTROL BAR (Hidden on Print)
          ───────────────────────────────────────────────────────────── */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-mist bg-paper/95 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-mist bg-paper text-ink hover:bg-fog transition-colors shadow-xs"
            title="Back to Command Center"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-ember bg-orange-50 px-2.5 py-0.5 rounded-full border border-ember/20">
                Official Statement
              </span>
              <span className="whitespace-nowrap text-xs text-pewter font-medium">• Executive PDF Export</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight mt-0.5">
              Monthly Health Statement
            </h1>
          </div>
        </div>

        {/* Persona Switcher & Print Trigger Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Persona quick toggle (demo only -- signed-in users see just their own data) */}
          {isDemoUserId(userId) && <div
            role="radiogroup"
            aria-label="Switch persona"
            className="flex items-center gap-1 rounded-full border border-mist bg-fog p-1 text-xs"
          >
            {DEMO_PERSONAS.map((p) => {
              const active = userId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setUserId(p.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
                    active
                      ? "bg-paper text-ink font-semibold shadow-xs border border-mist"
                      : "text-pewter hover:text-ink"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>}

          {/* Primary Print / Save as PDF Action */}
          <Button
            variant="primary"
            onClick={handlePrint}
            className="text-xs font-semibold gap-2 shadow-[0_2px_12px_rgba(23,37,84,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <Printer className="h-4 w-4" />
            <span>Print / Save PDF</span>
            <kbd className="hidden sm:inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono text-white">
              ⌘P
            </kbd>
          </Button>
        </div>
      </div>

      {/* Screen guidance hint */}
      <div className="print:hidden flex items-center justify-between text-xs text-pewter px-2">
        <span className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-emerald-600" />
          <span>Vector-grade typography • Standard A4 / Letter format</span>
        </span>
        <span>
          Tip: In Chrome print dialog, choose &quot;Save as PDF&quot; with &quot;Background graphics&quot; enabled.
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          LOADING & ERROR STATES
          ───────────────────────────────────────────────────────────── */}
      {loading && !data && (
        <Card className="p-8 sm:p-12 max-w-[860px] mx-auto w-full animate-pulse space-y-8">
          <div className="h-16 bg-fog rounded-xl w-2/3" />
          <HealthScoreSkeleton />
          <ListItemSkeleton rows={4} />
          <ListItemSkeleton rows={3} />
        </Card>
      )}

      {error && (
        <Card className="flex flex-col gap-4 border-rose-200 bg-rose-50/20 max-w-xl mx-auto my-12 text-center items-center py-8">
          <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-lg">
            !
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">Could not compile financial statement</h3>
            <p className="text-xs text-graphite mt-1 max-w-md">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload} className="mt-2">
            Retry Compilation
          </Button>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          THE PRINTABLE EXECUTIVE STATEMENT COMPONENT
          ───────────────────────────────────────────────────────────── */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <ExecutiveStatement
            dashboard={data.dashboard}
            accounts={data.accounts}
            transactions={data.transactions}
            userId={userId}
          />
        </motion.div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SCREEN-ONLY: OPTIONAL ON-CHAIN ANCHOR (testnet). Outside the printable
          article and hidden in @media print, so the PDF view is unchanged.
          ───────────────────────────────────────────────────────────── */}
      {data && (
        <StatementAnchorPanel data={{ userId, dashboard: data.dashboard, accounts: data.accounts, transactions: data.transactions }} />
      )}
    </div>
  );
}
