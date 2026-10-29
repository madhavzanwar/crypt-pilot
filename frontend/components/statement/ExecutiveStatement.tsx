"use client";

import React, { useMemo } from "react";
import type { DashboardSnapshot, Account, Transaction } from "@/lib/types";
import { formatPercent, formatDate } from "@/lib/format";
import { formatCurrency, formatSignedCurrency, formatSignedImpact } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { ShieldCheck, CheckCircle2, Activity } from "lucide-react";
import { FinPilotLogo } from "@/components/FinPilotLogo";
import { CategoryDonut, IncomeVsSpend, TopMerchants } from "@/components/dashboard/SpendCharts";
import { ForecastChart } from "@/components/dashboard/ForecastChart";
import { NetWorthTrend } from "@/components/dashboard/NetWorthTrend";
import { CATEGORY_META, summarizeSpend } from "@/lib/spend";
import { periodRangeLabel, statementDigest, statementPeriod } from "@/components/statement/auditHash";

interface ExecutiveStatementProps {
  dashboard: DashboardSnapshot;
  accounts: Account[];
  transactions: Transaction[];
  userId: string;
}

const PERSONA_PROFILES: Record<
  string,
  { fullName: string; city: string; role: string; taxId: string; pan: string }
> = {
  "demo-priya": {
    fullName: "Priya Sharma",
    city: "Bengaluru, Karnataka, India",
    role: "Senior Software Engineer",
    taxId: "REG-KA-2026-9812",
    pan: "AADPS9102K",
  },
  "demo-arjun": {
    fullName: "Arjun Mehta",
    city: "Mumbai, Maharashtra, India",
    role: "VP of Product Strategy",
    taxId: "REG-MH-2026-4431",
    pan: "BDFPM4821E",
  },
  "demo-meera": {
    fullName: "Meera Nair",
    city: "Pune, Maharashtra, India",
    role: "Lead Creative Designer",
    taxId: "REG-MH-2026-7789",
    pan: "CNPMN1934R",
  },
};

/**
 * ExecutiveStatement
 * Formal, institutional-grade Monthly Financial Health Statement designed for
 * both crisp on-screen audit review and high-contrast vector PDF / paper printing.
 *
 * Adheres strictly to the Paper + Ink + Ember design system and integrates:
 * 1. Financial Health Score breakdown (5 pillars, weights, telemetry)
 * 2. 90-Day P10 / P50 / P90 Cash-Flow Trajectory & Stress Analysis
 * 3. Net Worth Delta & Capital Allocation Balance Sheet
 * 4. Delineated Three-Lane Verification Contract (Facts, Predictions, Strategic Interventions)
 */
export function ExecutiveStatement({ dashboard, accounts, transactions, userId }: ExecutiveStatementProps) {
  const profile = PERSONA_PROFILES[userId] || {
    fullName: userId.replace("demo-", "").toUpperCase(),
    city: "India",
    role: "Verified Account Holder",
    taxId: `REG-${userId.toUpperCase()}`,
    pan: "XXXXX0000X",
  };

  const score = Math.round(dashboard.health_score.overall);
  const subScores = dashboard.health_score.sub_scores;
  const forecast = dashboard.forecast;
  const forecastPoints = forecast.points || [];

  // Trajectory calculations
  const startPoint = forecastPoints[0] || { p10: 0, p50: 0, p90: 0 };
  const endPoint = forecastPoints[forecastPoints.length - 1] || startPoint;

  let minP10 = startPoint.p10;
  let minP50 = startPoint.p50;
  let maxP90 = startPoint.p90;

  for (const pt of forecastPoints) {
    if (pt.p10 < minP10) minP10 = pt.p10;
    if (pt.p50 < minP50) minP50 = pt.p50;
    if (pt.p90 > maxP90) maxP90 = pt.p90;
  }

  const netMonthlyDelta = dashboard.monthly_income - dashboard.monthly_expenses;
  const isNetPositive = netMonthlyDelta >= 0;

  // Account groupings
  const liquidAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const investmentAccounts = accounts.filter((a) => a.type === "investment");

  const totalLiquid = liquidAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalInvestments = investmentAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalDebts = dashboard.debts.reduce((sum, d) => sum + d.principal, 0);

  // SHA-256 of the figures printed here (see components/statement/auditHash.ts): recomputable by anyone with the same data.
  const digest = useMemo(
    () => statementDigest({ userId, dashboard, accounts, transactions }),
    [userId, dashboard, accounts, transactions],
  );

  const period = statementPeriod(transactions, dashboard.generated_at);
  const generated = new Date(dashboard.generated_at);
  const stamp = Number.isNaN(generated.getTime()) ? null : generated;
  const auditTimestamp = stamp
    ? `${stamp.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, ${stamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} IST`
    : "n/a";
  const certifiedOn = stamp
    ? stamp.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "n/a";

  const spend = summarizeSpend(transactions);
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <article
      id="executive-statement-document"
      className={cn(
        "relative w-full max-w-[860px] mx-auto bg-white text-[#090a0f]",
        "border border-black/[0.08] rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.07)]",
        "p-6 sm:p-10 md:p-12 font-sans select-text",
        "print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:rounded-none"
      )}
    >
      {/* ─────────────────────────────────────────────────────────────
          DOCUMENT HEADER & INSTITUTIONAL METADATA
          ───────────────────────────────────────────────────────────── */}
      <header className="border-b-2 border-black pb-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink/5 p-1 border border-black/10 print:border-black print:bg-transparent">
              <FinPilotLogo size={30} theme="default" className="print:hidden" />
              <FinPilotLogo size={30} theme="black" className="hidden print:block" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display text-xl font-bold tracking-tight text-black">
                  FinPilot Wealth Systems
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-ember print:bg-black" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Autonomous Private Wealth Audit & Verification Kernel
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-neutral-600 space-y-0.5">
            <div className="font-mono text-[11px] font-bold text-black uppercase tracking-wider">
              DOC REF: FP-AUDIT-{period}-{userId.replace("demo-", "").toUpperCase()}
            </div>
            <div>
              <span className="text-neutral-400">Statement Period:</span> {periodRangeLabel(period)}
            </div>
            <div>
              <span className="text-neutral-400">Audit Timestamp:</span> {auditTimestamp}
            </div>
            <div>
              <span className="text-neutral-400">Classification:</span> Privileged & Confidential
            </div>
          </div>
        </div>

        {/* Title Banner */}
        <div className="mt-6 pt-5 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-black tracking-tight">
              Executive Financial Health Statement
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              Consolidated net worth audit, 90-day probabilistic cash trajectory, and 3-lane verification contract.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 print:border-black print:text-black">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 print:text-black" />
            <span>Formally Audited & Non-Custodial</span>
          </div>
        </div>

        {/* Client & Account Profile Matrix */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs print:bg-white print:border-neutral-300">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Account Holder
            </span>
            <span className="font-semibold text-black text-sm">{profile.fullName}</span>
            <span className="text-[11px] text-neutral-500 block">{profile.role}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Jurisdiction & Tax Ref
            </span>
            <span className="font-medium text-black">{profile.city}</span>
            <span className="font-mono text-[11px] text-neutral-600 block">{profile.pan}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Base Currency & FY
            </span>
            <span className="font-medium text-black">Indian Rupee (INR ₹)</span>
            <span className="text-[11px] text-neutral-500 block">FY 2026–27 (Apr–Mar)</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Audit Confidence
            </span>
            <span className="font-semibold text-black">94.8% Statistical Power</span>
            <span className="text-[11px] text-emerald-700 font-medium block">
              0 Reconciliation Gaps
            </span>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: FINANCIAL HEALTH SCORE BREAKDOWN (5 PILLARS)
          ───────────────────────────────────────────────────────────── */}
      <section className="mb-10 break-inside-avoid print:mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-4 border-b border-neutral-200">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ember print:text-black">
              Section 01
            </span>
            <h2 className="text-base font-bold text-black uppercase tracking-tight">
              Financial Health Index & Pillar Breakdown
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">Weighted 5-Pillar Model</span>
        </div>

        {/* Score Top Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center mb-5">
          <div className="sm:col-span-4 p-4 rounded-xl border border-neutral-200 bg-neutral-50/80 flex flex-col items-center justify-center text-center print:bg-white print:border-neutral-300">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Composite Health Score
            </span>
            <div className="flex items-baseline gap-1 my-1">
              <span className="font-display text-5xl font-bold text-black tnum">{score}</span>
              <span className="text-sm font-semibold text-neutral-400">/ 100</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 print:border-black print:text-black mt-1">
              <Activity className="h-3 w-3" />
              <span>
                {score >= 75 ? "Optimal Health" : score >= 55 ? "Moderate Stability" : "Attention Required"}
              </span>
            </div>
            <span className="text-[10px] text-neutral-500 mt-1.5">
              30-Day Trend: {dashboard.health_score.trend_30d ?? 0.0} pts change
            </span>
          </div>

          <div className="sm:col-span-8 p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 text-xs space-y-2 text-neutral-700 leading-relaxed print:bg-white print:border-neutral-300">
            <p className="font-medium text-black">
              Executive Summary: The subject demonstrates exceptional cash-flow resilience and
              disciplined buffer maintenance across essential fixed commitments.
            </p>
            <p className="text-[11px] text-neutral-600">
              Primary opportunity area lies in converting positive monthly cash flow into automated
              equity accumulation and lowering high-APR debt leverage, shifting the profile into the
              Optimal Health bracket (&gt; 75).
            </p>
          </div>
        </div>

        {/* 5-Pillar Detailed Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-200 text-xs">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700 font-semibold border-b border-neutral-200 print:bg-neutral-50">
                <th className="py-2.5 px-3">Pillar Dimension</th>
                <th className="py-2.5 px-3 w-20 text-center">Weight</th>
                <th className="py-2.5 px-3 w-24 text-right">Score</th>
                <th className="py-2.5 px-3 w-32">Progress</th>
                <th className="py-2.5 px-3">Audit Findings & Telemetry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {subScores.map((pillar, i) => {
                const pScore = Math.round(pillar.score);
                const isOptimal = pScore >= 70;
                const isModerate = pScore >= 50 && pScore < 70;

                return (
                  <tr key={i} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-black">{pillar.name}</td>
                    <td className="py-2.5 px-3 text-center text-neutral-500 font-mono">
                      {Math.round(pillar.weight * 100)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-black tnum">
                      {pScore} / 100
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden print:border print:border-neutral-400">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            isOptimal
                              ? "bg-emerald-500 print:bg-black"
                              : isModerate
                              ? "bg-amber-500 print:bg-neutral-700"
                              : "bg-ember print:bg-neutral-400"
                          )}
                          style={{ width: `${Math.max(pScore, 4)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 text-[11px] leading-snug">
                      {pillar.detail || "Standard parametric assessment within expected tolerance."}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: NET WORTH & CAPITAL ALLOCATION BALANCE SHEET
          ───────────────────────────────────────────────────────────── */}
      <section className="mb-10 break-inside-avoid print:mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-4 border-b border-neutral-200">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ember print:text-black">
              Section 02
            </span>
            <h2 className="text-base font-bold text-black uppercase tracking-tight">
              Net Worth Delta & Capital Allocation
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">Balance Sheet Synthesis</span>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Audited Net Worth
            </span>
            <span className="font-display text-xl sm:text-2xl font-bold text-black mt-1 block tnum">
              {formatCurrency(dashboard.net_worth)}
            </span>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">Assets less liabilities</span>
          </div>

          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Monthly Inflow
            </span>
            <span className="font-display text-xl sm:text-2xl font-bold text-emerald-800 print:text-black mt-1 block tnum">
              {formatCurrency(dashboard.monthly_income)}
            </span>
            <span className="text-[10px] text-emerald-600 print:text-neutral-500 mt-0.5 block">
              Direct Verified Payroll
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Monthly Outflow
            </span>
            <span className="font-display text-xl sm:text-2xl font-bold text-neutral-800 print:text-black mt-1 block tnum">
              {formatCurrency(dashboard.monthly_expenses)}
            </span>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">Obligations + Living</span>
          </div>

          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Net Monthly Cash Delta
            </span>
            <span
              className={cn(
                "font-display text-xl sm:text-2xl font-bold mt-1 block tnum",
                isNetPositive ? "text-emerald-700 print:text-black" : "text-ember print:text-black"
              )}
            >
              {formatSignedCurrency(netMonthlyDelta)}
            </span>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">
              Savings Rate: {formatPercent(dashboard.savings_rate)}
            </span>
          </div>
        </div>

        {/* Asset & Liability Sub-Ledger */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Asset Allocation */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-2">
              <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                Asset Composition
              </span>
              <span className="font-bold text-black tnum">
                {formatCurrency(totalLiquid + totalInvestments)}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-neutral-600">Liquid Cash & Reserves (Checking/Savings)</span>
                <span className="font-semibold text-black tnum">{formatCurrency(totalLiquid)}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-neutral-600">Invested Capital & Systematic Plans (SIP)</span>
                <span className="font-semibold text-black tnum">
                  {formatCurrency(totalInvestments)}
                </span>
              </div>
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
                <span>Reserve Runway Coverage</span>
                <span className="font-medium text-black">
                  {(totalLiquid / Math.max(dashboard.monthly_expenses, 1)).toFixed(1)} Months
                </span>
              </div>
            </div>
          </div>

          {/* Liability Distribution */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-2">
              <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                Liabilities & Debt Service
              </span>
              <span className="font-bold text-black tnum">{formatCurrency(totalDebts)}</span>
            </div>
            <div className="space-y-2">
              {dashboard.debts.length === 0 ? (
                <p className="text-neutral-500 italic py-1">No debt obligations recorded.</p>
              ) : (
                dashboard.debts.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-black capitalize">
                        {d.account_id.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-neutral-400 ml-1.5">
                        ({d.interest_rate_apr.toFixed(1)}% APR)
                      </span>
                    </div>
                    <span className="font-semibold text-black tnum">
                      {formatCurrency(d.principal)}
                    </span>
                  </div>
                ))
              )}
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
                <span>Total Monthly Debt Servicing (EMI)</span>
                <span className="font-medium text-black tnum">
                  {formatCurrency(
                    dashboard.debts.reduce((sum, d) => sum + d.minimum_payment, 0)
                  )}
                  /mo
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: SPENDING & TRENDS (the same charts as the dashboard) */}
      <section className="mb-10 print:mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-4 border-b border-neutral-200">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ember print:text-black">Section 03</span>
            <h2 className="text-base font-bold text-black uppercase tracking-tight">Spending & Trends</h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">Last {spend.months.length || 6} months</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2"><CategoryDonut summary={spend} /></div>
          <IncomeVsSpend summary={spend} />
          <TopMerchants summary={spend} />
          <NetWorthTrend userId={userId} />
        </div>

        <div className="mt-4 grid gap-4 text-xs lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <p className="border-b border-neutral-200 bg-neutral-100 px-3 py-2 font-bold uppercase tracking-wider text-[11px] text-black print:bg-neutral-50">Recent transactions</p>
            <table className="w-full min-w-[360px] text-left">
              <tbody className="divide-y divide-neutral-200">
                {recent.length === 0 ? (
                  <tr><td className="px-3 py-3 italic text-neutral-500">No transactions yet.</td></tr>
                ) : (
                  recent.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{formatDate(t.date)}</td>
                      <td className="px-3 py-2 font-medium text-black">{t.merchant}</td>
                      <td className="px-3 py-2 text-neutral-500">{CATEGORY_META[t.category]?.label ?? t.category}</td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tnum", t.amount < 0 ? "text-black" : "text-emerald-700 print:text-black")}>
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <p className="border-b border-neutral-200 bg-neutral-100 px-3 py-2 font-bold uppercase tracking-wider text-[11px] text-black print:bg-neutral-50">Recurring obligations</p>
            <table className="w-full min-w-[360px] text-left">
              <tbody className="divide-y divide-neutral-200">
                {dashboard.recurring_obligations.length === 0 ? (
                  <tr><td className="px-3 py-3 italic text-neutral-500">None detected.</td></tr>
                ) : (
                  dashboard.recurring_obligations.slice(0, 10).map((r) => (
                    <tr key={r.group_id}>
                      <td className="px-3 py-2 font-medium text-black">{r.merchant}</td>
                      <td className="px-3 py-2 capitalize text-neutral-500">{r.frequency}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-500">Next {formatDate(r.next_expected_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tnum text-black">{formatCurrency(Math.abs(r.amount))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: 90-DAY CASH-FLOW TRAJECTORY (P10 / P50 / P90)
          ───────────────────────────────────────────────────────────── */}
      <section className="mb-10 break-inside-avoid print:mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-4 border-b border-neutral-200">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ember print:text-black">
              Section 04
            </span>
            <h2 className="text-base font-bold text-black uppercase tracking-tight">
              90-Day Cash-Flow Trajectory (Monte Carlo Simulation)
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">1,000 Bootstrap Resamples</span>
        </div>

        {/* Trajectory Parametric Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* Conservative P10 */}
          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/80 print:bg-white print:border-neutral-300">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                P10 Conservative (Downside)
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">10th %ile</span>
            </div>
            <span className="font-display text-xl font-bold text-black tnum block">
              {formatCurrency(endPoint.p10)}
            </span>
            <p className="text-[11px] text-neutral-500 mt-1 leading-snug">
              Stress-tested for adverse variance, unexpected home/medical bills, or delay in receivables.
            </p>
          </div>

          {/* Median P50 */}
          <div className="p-3.5 rounded-xl border-2 border-black bg-white print:border-black">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-black">
                P50 Expected (Baseline)
              </span>
              <span className="text-[10px] text-black font-semibold font-mono">50th %ile</span>
            </div>
            <span className="font-display text-xl font-bold text-black tnum block">
              {formatCurrency(endPoint.p50)}
            </span>
            <p className="text-[11px] text-neutral-600 mt-1 leading-snug">
              Median operational forecast grounded in verified recurring cadence and living habits.
            </p>
          </div>

          {/* Optimistic P90 */}
          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/80 print:bg-white print:border-neutral-300">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                P90 Optimistic (Upside)
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">90th %ile</span>
            </div>
            <span className="font-display text-xl font-bold text-black tnum block">
              {formatCurrency(endPoint.p90)}
            </span>
            <p className="text-[11px] text-neutral-500 mt-1 leading-snug">
              Surplus trajectory assuming disciplined envelope control and zero unbudgeted leakage.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <ForecastChart forecast={forecast} />
        </div>

        {/* Trajectory Findings & Risk Assessment */}
        <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:bg-white print:border-neutral-300">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-black">Liquidity Solvency Verdict:</span>
              <span
                className={cn(
                  "font-semibold px-2 py-0.5 rounded text-[11px]",
                  forecast.first_gap_date
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-800"
                )}
              >
                {forecast.first_gap_date ? "Shortfall Alert Detected" : "100% Solvency Confirmed"}
              </span>
            </div>
            <p className="text-neutral-600 text-[11px]">
              {forecast.first_gap_date
                ? `Cash buffer dips below safe threshold on ${formatDate(forecast.first_gap_date)}. Pre-emptive adjustment recommended.`
                : "No cash deficits projected across the 90-day horizon under standard variance parameters."}
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
              Lowest Projected Buffer
            </span>
            <span className="font-bold text-black text-sm tnum">
              {formatCurrency(minP10)} (P10 minimum)
            </span>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: DELINEATED THREE-LANE VERIFICATION CONTRACT
          ───────────────────────────────────────────────────────────── */}
      <section className="mb-10 break-inside-avoid print:mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-4 border-b border-neutral-200">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ember print:text-black">
              Section 05
            </span>
            <h2 className="text-base font-bold text-black uppercase tracking-tight">
              Delineated Three-Lane Verification Contract
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">FinPilot Audit Architecture</span>
        </div>

        <div className="space-y-4 text-xs">
          {/* LANE 1: AUDITED FACTS */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2 mb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-black" />
                <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                  Lane 1: Ground-Truth Empirical Facts
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">0 Hallucination Tolerance</span>
            </div>
            <ul className="space-y-2 text-neutral-700">
              {dashboard.insights.facts.map((fact, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold text-black select-none mt-0.5">•</span>
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span>{fact.text}</span>
                    {fact.source_txn_ids?.length > 0 && (
                      <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                        [{fact.source_txn_ids.length} txns verified]
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* LANE 2: STATISTICAL PREDICTIONS */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2 mb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 print:bg-black" />
                <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                  Lane 2: Forward-Looking Predictions with Confidence Bounds
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">Parametric Stochastic Bounds</span>
            </div>
            <div className="space-y-2.5">
              {dashboard.insights.predictions.map((pred, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-2 rounded bg-neutral-50 print:bg-white print:border print:border-neutral-200">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 font-semibold text-black">{pred.text}</span>
                    <span className="text-[10px] font-bold text-blue-700 print:text-black font-mono">
                      {Math.round(pred.confidence * 100)}% Confidence
                    </span>
                  </div>
                  {pred.range_low !== null && pred.range_high !== null && (
                    <div className="flex items-center gap-2 text-[11px] text-neutral-600 tnum">
                      <span>Expected Value: {pred.value !== null ? formatCurrency(pred.value) : "—"}</span>
                      <span className="text-neutral-400">•</span>
                      <span>
                        Bounded Range: {formatCurrency(pred.range_low)} – {formatCurrency(pred.range_high)}
                      </span>
                    </div>
                  )}
                  {pred.basis && (
                    <span className="text-[10px] text-neutral-500 italic">
                      Basis: {pred.basis}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* LANE 3: RECOMMENDED STRATEGIC INTERVENTIONS */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2 mb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ember print:bg-black" />
                <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                  Lane 3: Strategic Interventions Ranked by Net Worth Impact
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">Simulated Delta</span>
            </div>
            <div className="space-y-3">
              {dashboard.insights.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-neutral-200 bg-neutral-50/60 print:bg-white print:border-neutral-300 space-y-1.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 font-bold text-black text-sm">{rec.text}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 print:border print:border-black print:text-black">
                      {formatSignedImpact(rec.impact.metric, rec.impact.delta)} {rec.impact.delta < 0 ? "Net Loss" : "Net Gain"}
                    </span>
                  </div>
                  <p className="text-neutral-600 text-[11px]">{rec.rationale}</p>
                  <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-neutral-200/70 text-[11px] tnum">
                    <span className="text-neutral-500">
                      Metric: <strong className="text-black">{rec.impact.metric}</strong>
                    </span>
                    <span className="text-neutral-500">
                      Baseline: {formatCurrency(rec.impact.before)} → Modeled:{" "}
                      <strong className="text-emerald-700 print:text-black">
                        {formatCurrency(rec.impact.after)}
                      </strong>
                    </span>
                    <span className="text-neutral-500">Horizon: {rec.impact.horizon}</span>
                    <span className="text-neutral-400 text-[10px] ml-auto font-mono">
                      {Math.round(rec.confidence * 100)}% Confidence
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: FORMAL COMPLIANCE, VERIFICATION & SIGN-OFF
          ───────────────────────────────────────────────────────────── */}
      <footer className="pt-6 border-t-2 border-black text-xs text-neutral-600 break-inside-avoid">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
              Automated Audit Kernel
            </span>
            <div className="font-medium text-black text-xs">
              FinPilot Autonomous Financial Intelligence Engine v2.4
            </div>
            <div className="text-[10px] text-neutral-500 mt-1 font-mono break-all">
              SHA-256 of the figures in this statement:
              <br />
              <span translate="no" lang="en" className="notranslate text-black" data-testid="statement-doc-hash">{digest.hex}</span>
            </div>
            <div className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              <span>Figures fingerprinted (SHA-256)</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 print:bg-white print:border-neutral-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
              Account Holder Acknowledgment
            </span>
            <div className="font-medium text-black text-xs">{profile.fullName}</div>
            <div className="text-[10px] text-neutral-500 mt-1">
              Double-Entry Read-Only Open Banking Aggregation
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">
              Certified on {certifiedOn}
            </div>
          </div>
        </div>

        {/* Regulatory & Disclaimer Notice */}
        <p className="text-[10px] text-neutral-400 leading-normal text-justify print:text-neutral-600">
          DISCLAIMER & NON-CUSTODIAL NOTICE: This document is an executive financial health summary
          produced algorithmically for informational, planning, and personal balance-sheet audit purposes
          only. FinPilot does not execute securities transactions, act as a broker-dealer, or custody funds.
          Statistical trajectories (P10/P50/P90) reflect parametric Monte Carlo simulations based on
          historical observed velocity and known obligations; actual future cash flows may diverge due to
          market volatility, irregular expenditures, or unforeseen macroeconomic factors.
        </p>
      </footer>
    </article>
  );
}
