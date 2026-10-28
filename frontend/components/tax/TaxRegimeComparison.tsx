"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Info,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import type { TaxOptimizationAnalysis } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/utils";

interface TaxRegimeComparisonProps {
  initialAnalysis: TaxOptimizationAnalysis;
  userId: string;
}

export function TaxRegimeComparison({ initialAnalysis, userId }: TaxRegimeComparisonProps) {
  const [analysis, setAnalysis] = useState<TaxOptimizationAnalysis>(initialAnalysis);
  const [isPending, startTransition] = useTransition();
  const [showSlabs, setShowSlabs] = useState(false);

  // Form State initialized from analysis / detected deductions
  const [grossIncome, setGrossIncome] = useState(initialAnalysis.gross_annual_income);
  const [sec80c, setSec80c] = useState(
    initialAnalysis.old_regime.deductions_applied.section_80c ||
      initialAnalysis.detected_deductions.section_80c_detected ||
      0
  );
  const [sec80d, setSec80d] = useState(
    initialAnalysis.old_regime.deductions_applied.section_80d ||
      initialAnalysis.detected_deductions.section_80d_detected ||
      0
  );
  const [secNps, setSecNps] = useState(
    initialAnalysis.old_regime.deductions_applied.section_80ccd_1b_nps || 0
  );
  const [sec24b, setSec24b] = useState(
    initialAnalysis.old_regime.deductions_applied.section_24b_home_loan_interest ||
      initialAnalysis.detected_deductions.home_loan_interest_detected ||
      0
  );
  const [hra, setHra] = useState(initialAnalysis.old_regime.deductions_applied.hra_exemption || 0);

  async function handleRecalculate(params?: {
    income?: number;
    c80?: number;
    d80?: number;
    nps?: number;
    b24?: number;
    hraExempt?: number;
  }) {
    const inc = params?.income !== undefined ? params.income : grossIncome;
    const c = params?.c80 !== undefined ? params.c80 : sec80c;
    const d = params?.d80 !== undefined ? params.d80 : sec80d;
    const n = params?.nps !== undefined ? params.nps : secNps;
    const b = params?.b24 !== undefined ? params.b24 : sec24b;
    const h = params?.hraExempt !== undefined ? params.hraExempt : hra;

    startTransition(async () => {
      try {
        const result = await api.calculateTax(userId, {
          gross_annual_income: inc,
          section_80c: c,
          section_80d: d,
          section_80ccd_1b_nps: n,
          section_24b_home_loan: b,
          hra_exemption: h,
        });
        setAnalysis(result);
      } catch (err) {
        console.error("Failed to recalculate tax", err);
      }
    });
  }

  function handleReset() {
    setGrossIncome(initialAnalysis.gross_annual_income);
    setSec80c(initialAnalysis.detected_deductions.section_80c_detected || 0);
    setSec80d(initialAnalysis.detected_deductions.section_80d_detected || 0);
    setSecNps(0);
    setSec24b(initialAnalysis.detected_deductions.home_loan_interest_detected || 0);
    setHra(initialAnalysis.old_regime.deductions_applied.hra_exemption || 0);

    setAnalysis(initialAnalysis);
  }

  const isNewWinner = analysis.recommended_regime === "new";
  const savings = analysis.annual_tax_savings;
  const monthlySavings = analysis.monthly_take_home_delta;

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─────────────────────────────────────────────────────────────
          1. WINNER HERO & EXECUTIVE RATIONALE
          ───────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-card p-6 sm:p-8 border shadow-sm relative overflow-hidden transition-colors",
          isNewWinner
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50/50 via-white to-paper"
            : "border-ember/20 bg-gradient-to-br from-amber-50/40 via-white to-paper"
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  isNewWinner
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-ember/10 text-ember border border-ember/30"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isNewWinner ? "New Tax Regime Recommended" : "Old Tax Regime Recommended"}
              </span>
              <span className="text-xs text-pewter font-medium">FY 2026–27 Assessment</span>
            </div>

            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-medium text-ink">
                {savings > 0 ? (
                  <>
                    Save <span className="font-bold text-ink">{formatCurrency(savings)}</span>/year
                    <span className="text-graphite font-normal text-lg sm:text-xl ml-2">
                      (+{formatCurrency(monthlySavings)}/mo take-home)
                    </span>
                  </>
                ) : (
                  "Both Regimes Result in Identical Tax Liability"
                )}
              </h2>
              <p className="text-xs sm:text-sm text-graphite mt-1.5 leading-relaxed">
                {analysis.recommendation_rationale}
              </p>
            </div>

            {analysis.break_even_deductions_needed > 0 && isNewWinner && (
              <div className="flex items-start gap-2 p-3 rounded-chip bg-paper border border-black/[0.08] text-xs text-graphite">
                <Info className="w-4 h-4 text-ember shrink-0 mt-0.5" />
                <span>
                  <strong>Break-even threshold:</strong> You would need at least{" "}
                  <strong className="text-ink font-semibold">
                    {formatCurrency(analysis.break_even_deductions_needed)}
                  </strong>{" "}
                  in additional eligible deductions under the Old Regime to match the New Regime&apos;s
                  savings.
                </span>
              </div>
            )}
          </div>

          {/* Call to action & simulator deep link */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <Link
              href={`/simulate?action=increase_sip&amount=${Math.max(5000, Math.round(monthlySavings))}`}
            >
              <Button variant="primary" size="md" className="w-full justify-center gap-2 text-xs font-semibold shadow-xs">
                <Sparkles className="w-4 h-4" />
                <span>⚡ Test in What-If Simulator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>

            <Button
              variant="secondary"
              size="md"
              onClick={handleReset}
              className="w-full justify-center gap-2 text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5 text-pewter" />
              <span>Reset to Detected Data</span>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────
          2. SIDE-BY-SIDE REGIME COMPARISON CARDS
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* NEW REGIME CARD */}
        <Card
          className={cn(
            "p-6 sm:p-7 relative transition-all",
            isNewWinner
              ? "border-emerald-300 ring-2 ring-emerald-500/20 shadow-md"
              : "border-black/[0.08]"
          )}
        >
          {isNewWinner && (
            <div className="absolute top-4 right-4">
              <Chip tone="accent">Lowest Tax</Chip>
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-xl font-bold text-ink">New Tax Regime</h3>
            <span className="text-[11px] text-pewter font-medium">(Section 115BAC)</span>
          </div>
          <p className="text-xs text-graphite mb-5">
            Default regime. Simpler structure with wider slabs, ₹75,000 standard deduction, and full
            tax rebate on income up to ₹7.75 Lakhs.
          </p>

          <div className="space-y-4 pt-4 border-t border-black/[0.06]">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-pewter block">
                Net Annual Tax Payable
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-3xl font-bold text-ink tnum">
                  {formatCurrency(analysis.new_regime.net_tax_payable)}
                </span>
                <span className="text-xs text-graphite">
                  ({analysis.new_regime.effective_tax_rate_pct.toFixed(1)}% effective)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-chip bg-fog border border-mist text-xs">
              <div>
                <span className="text-pewter block text-[11px]">Monthly Take-Home</span>
                <span className="font-bold text-ink text-sm tnum">
                  {formatCurrency(analysis.new_regime.monthly_take_home)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">Taxable Income</span>
                <span className="font-semibold text-ink text-sm tnum">
                  {formatCurrency(analysis.new_regime.taxable_income)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">Standard Deduction</span>
                <span className="font-medium text-ink tnum">
                  {formatCurrency(analysis.new_regime.total_deductions)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">87A Rebate Applied</span>
                <span className="font-medium text-emerald-700 tnum">
                  {analysis.new_regime.rebate_87a > 0
                    ? `-${formatCurrency(analysis.new_regime.rebate_87a)}`
                    : "₹0"}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-pewter flex items-center justify-between pt-1">
              <span>Health & Education Cess (4%):</span>
              <span className="font-mono text-ink tnum">
                {formatCurrency(analysis.new_regime.cess_4pct)}
              </span>
            </div>
          </div>
        </Card>

        {/* OLD REGIME CARD */}
        <Card
          className={cn(
            "p-6 sm:p-7 relative transition-all",
            !isNewWinner && savings > 0
              ? "border-ember/40 ring-2 ring-ember/20 shadow-md"
              : "border-black/[0.08]"
          )}
        >
          {!isNewWinner && savings > 0 && (
            <div className="absolute top-4 right-4">
              <Chip tone="accent">Lowest Tax</Chip>
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-xl font-bold text-ink">Old Tax Regime</h3>
            <span className="text-[11px] text-pewter font-medium">(With Deductions)</span>
          </div>
          <p className="text-xs text-graphite mb-5">
            Legacy regime. Beneficial for taxpayers with substantial deductions across Section 80C,
            80D, home loan interest, and HRA.
          </p>

          <div className="space-y-4 pt-4 border-t border-black/[0.06]">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-pewter block">
                Net Annual Tax Payable
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-3xl font-bold text-ink tnum">
                  {formatCurrency(analysis.old_regime.net_tax_payable)}
                </span>
                <span className="text-xs text-graphite">
                  ({analysis.old_regime.effective_tax_rate_pct.toFixed(1)}% effective)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-chip bg-fog border border-mist text-xs">
              <div>
                <span className="text-pewter block text-[11px]">Monthly Take-Home</span>
                <span className="font-bold text-ink text-sm tnum">
                  {formatCurrency(analysis.old_regime.monthly_take_home)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">Taxable Income</span>
                <span className="font-semibold text-ink text-sm tnum">
                  {formatCurrency(analysis.old_regime.taxable_income)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">Total Deductions</span>
                <span className="font-medium text-ink tnum">
                  {formatCurrency(analysis.old_regime.total_deductions)}
                </span>
              </div>
              <div>
                <span className="text-pewter block text-[11px]">87A Rebate Applied</span>
                <span className="font-medium text-emerald-700 tnum">
                  {analysis.old_regime.rebate_87a > 0
                    ? `-${formatCurrency(analysis.old_regime.rebate_87a)}`
                    : "₹0"}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-pewter flex items-center justify-between pt-1">
              <span>Health & Education Cess (4%):</span>
              <span className="font-mono text-ink tnum">
                {formatCurrency(analysis.old_regime.cess_4pct)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. INTERACTIVE WHAT-IF DEDUCTION SANDBOX
          ───────────────────────────────────────────────────────────── */}
      <Card className="p-6 sm:p-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember text-white shadow-xs">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <CardTitle>Interactive What-If Deduction Sandbox</CardTitle>
                <p className="text-xs text-graphite mt-0.5">
                  Adjust deductions and income in real-time to observe dynamic regime switching
                </p>
              </div>
            </div>
            {isPending && (
              <span className="text-xs text-ember font-medium animate-pulse">
                Recalculating...
              </span>
            )}
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
          {/* Gross Annual Income */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                Gross Annual Income (₹)
              </label>
            </div>
            <input
              type="number"
              step={10000}
              value={grossIncome}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setGrossIncome(val);
                handleRecalculate({ income: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <span className="text-[11px] text-pewter">
              ~{formatCurrency(grossIncome / 12)}/month gross salary
            </span>
          </div>

          {/* Section 80C */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                Section 80C (SIP / EPF / PPF)
              </label>
              <span className="text-[11px] text-pewter font-mono">Max ₹1.5L</span>
            </div>
            <input
              type="number"
              step={5000}
              max={150000}
              value={sec80c}
              onChange={(e) => {
                const val = Math.min(150000, Number(e.target.value) || 0);
                setSec80c(val);
                handleRecalculate({ c80: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <div className="flex items-center justify-between text-[11px] text-pewter">
              <span>Detected from SIPs:</span>
              <span className="font-medium text-ink">
                {formatCurrency(analysis.detected_deductions.section_80c_detected)}
              </span>
            </div>
          </div>

          {/* Section 80D */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                Section 80D (Health Insurance)
              </label>
              <span className="text-[11px] text-pewter font-mono">Max ₹75k</span>
            </div>
            <input
              type="number"
              step={5000}
              max={75000}
              value={sec80d}
              onChange={(e) => {
                const val = Math.min(75000, Number(e.target.value) || 0);
                setSec80d(val);
                handleRecalculate({ d80: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <div className="flex items-center justify-between text-[11px] text-pewter">
              <span>Detected from healthcare:</span>
              <span className="font-medium text-ink">
                {formatCurrency(analysis.detected_deductions.section_80d_detected)}
              </span>
            </div>
          </div>

          {/* Section 80CCD(1B) NPS */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                Section 80CCD(1B) (NPS)
              </label>
              <span className="text-[11px] text-pewter font-mono">Max ₹50k</span>
            </div>
            <input
              type="number"
              step={5000}
              max={50000}
              value={secNps}
              onChange={(e) => {
                const val = Math.min(50000, Number(e.target.value) || 0);
                setSecNps(val);
                handleRecalculate({ nps: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <span className="text-[11px] text-pewter">Additional voluntary NPS pension</span>
          </div>

          {/* Section 24(b) Home Loan Interest */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                Section 24(b) (Home Loan Interest)
              </label>
              <span className="text-[11px] text-pewter font-mono">Max ₹2.0L</span>
            </div>
            <input
              type="number"
              step={10000}
              max={200000}
              value={sec24b}
              onChange={(e) => {
                const val = Math.min(200000, Number(e.target.value) || 0);
                setSec24b(val);
                handleRecalculate({ b24: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <div className="flex items-center justify-between text-[11px] text-pewter">
              <span>Detected from home loans:</span>
              <span className="font-medium text-ink">
                {formatCurrency(analysis.detected_deductions.home_loan_interest_detected)}
              </span>
            </div>
          </div>

          {/* HRA Exemption */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-pewter">
                HRA Exemption / Rent Paid
              </label>
              <span className="text-[11px] text-pewter font-mono">Rent: {formatCurrency(analysis.detected_deductions.rent_paid_detected)}</span>
            </div>
            <input
              type="number"
              step={10000}
              value={hra}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setHra(val);
                handleRecalculate({ hraExempt: val });
              }}
              className="w-full rounded-chip border border-mist bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30 font-mono tnum"
            />
            <span className="text-[11px] text-pewter">Eligible rent allowance exemption</span>
          </div>
        </div>

        {/* Deductions Progress Gauges */}
        <div className="mt-8 pt-6 border-t border-black/[0.06] space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-pewter block">
            Statutory Deductions Cap Utilization
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 80C Gauge */}
            <div className="p-3 rounded-chip bg-fog border border-mist space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">Section 80C</span>
                <span className="font-mono text-pewter">{formatCurrency(sec80c)} / ₹1.5L</span>
              </div>
              <div className="w-full bg-mist/60 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-ember h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (sec80c / 150000) * 100)}%` }}
                />
              </div>
            </div>

            {/* 80D Gauge */}
            <div className="p-3 rounded-chip bg-fog border border-mist space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">Section 80D</span>
                <span className="font-mono text-pewter">{formatCurrency(sec80d)} / ₹75k</span>
              </div>
              <div className="w-full bg-mist/60 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (sec80d / 75000) * 100)}%` }}
                />
              </div>
            </div>

            {/* NPS Gauge */}
            <div className="p-3 rounded-chip bg-fog border border-mist space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">NPS 80CCD(1B)</span>
                <span className="font-mono text-pewter">{formatCurrency(secNps)} / ₹50k</span>
              </div>
              <div className="w-full bg-mist/60 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (secNps / 50000) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          4. SLAB-BY-SLAB BREAKDOWN COMPARISON ACCORDION
          ───────────────────────────────────────────────────────────── */}
      <Card className="p-6">
        <button
          type="button"
          onClick={() => setShowSlabs(!showSlabs)}
          className="w-full flex items-center justify-between text-left group"
        >
          <div className="flex items-center gap-2.5">
            <Calculator className="w-4 h-4 text-ember" />
            <h4 className="text-sm font-semibold text-ink group-hover:text-ember transition-colors">
              Inspect Detailed Tax Slabs & Calculation Math
            </h4>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-pewter">
            <span>{showSlabs ? "Hide Slabs" : "View Slabs"}</span>
            {showSlabs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        <AnimatePresence>
          {showSlabs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden pt-6 mt-4 border-t border-black/[0.06]"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                {/* New Regime Slabs Table */}
                <div>
                  <h5 className="font-semibold text-ink mb-2.5 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    New Tax Regime Slabs (Section 115BAC)
                  </h5>
                  <div className="overflow-x-auto rounded-chip border border-mist">
                    <table className="w-full text-left">
                      <thead className="bg-fog text-pewter font-semibold border-b border-mist">
                        <tr>
                          <th className="py-2 px-3">Bracket</th>
                          <th className="py-2 px-2 text-center">Rate</th>
                          <th className="py-2 px-3 text-right">Taxable Amt</th>
                          <th className="py-2 px-3 text-right">Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mist font-mono tnum">
                        {analysis.new_regime.slabs.map((slab, i) => (
                          <tr key={i} className="hover:bg-fog/50">
                            <td className="py-2 px-3 text-ink font-sans">{slab.slab_label}</td>
                            <td className="py-2 px-2 text-center text-pewter">{slab.rate_pct}%</td>
                            <td className="py-2 px-3 text-right text-graphite">
                              {formatCurrency(slab.taxable_amount_in_slab)}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-ink">
                              {formatCurrency(slab.tax_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Old Regime Slabs Table */}
                <div>
                  <h5 className="font-semibold text-ink mb-2.5 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Old Tax Regime Slabs
                  </h5>
                  <div className="overflow-x-auto rounded-chip border border-mist">
                    <table className="w-full text-left">
                      <thead className="bg-fog text-pewter font-semibold border-b border-mist">
                        <tr>
                          <th className="py-2 px-3">Bracket</th>
                          <th className="py-2 px-2 text-center">Rate</th>
                          <th className="py-2 px-3 text-right">Taxable Amt</th>
                          <th className="py-2 px-3 text-right">Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mist font-mono tnum">
                        {analysis.old_regime.slabs.map((slab, i) => (
                          <tr key={i} className="hover:bg-fog/50">
                            <td className="py-2 px-3 text-ink font-sans">{slab.slab_label}</td>
                            <td className="py-2 px-2 text-center text-pewter">{slab.rate_pct}%</td>
                            <td className="py-2 px-3 text-right text-graphite">
                              {formatCurrency(slab.taxable_amount_in_slab)}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-ink">
                              {formatCurrency(slab.tax_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
