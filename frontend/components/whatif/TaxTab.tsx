"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { isDemoUserId } from "@/lib/user";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TaxRegimeComparison } from "@/components/tax/TaxRegimeComparison";

export function TaxTab() {
  const userId = useUserId();
  const fetchTaxAnalysis = useCallback(() => api.taxAnalysis(userId), [userId]);
  const { data, error, loading, reload } = useAsync(fetchTaxAnalysis, [userId]);
  const isDemo = isDemoUserId(userId);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-44 rounded-card bg-fog/80 border border-mist p-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-72 rounded-card bg-fog/60 border border-mist p-6" />
          <div className="h-72 rounded-card bg-fog/60 border border-mist p-6" />
        </div>
        <div className="h-80 rounded-card bg-fog/40 border border-mist p-6" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col gap-4 border-rose-200 bg-rose-50/20 max-w-xl mx-auto my-12 text-center items-center py-8">
        <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-lg">
          !
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">Could not load tax analysis</h3>
          <p className="text-xs text-graphite mt-1 max-w-md">{error}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={reload} className="mt-2">
          Retry Analysis
        </Button>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-8 pb-12 min-w-0 max-w-full"
    >
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.04]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">
              Old vs new tax regime
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-graphite mt-0.5">
            Compare the new regime (Section 115BAC) with the old one, including 80C, 80D, 80CCD(1B) and home loan deductions, for{" "}
            <span className="font-semibold text-ink capitalize">
              {isDemo ? userId.replace("demo-", "") : "your profile"}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={reload} className="text-xs">
            <svg
              className="w-3.5 h-3.5 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </Button>

          <Link href="/statement">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs font-semibold gap-1.5 shadow-xs border-mist hover:border-black/20"
            >
              <FileText className="w-3.5 h-3.5 text-ember" />
              <span>Statement</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Interactive Comparison & Sandbox */}
      <TaxRegimeComparison initialAnalysis={data} userId={userId} />
    </motion.div>
  );
}
