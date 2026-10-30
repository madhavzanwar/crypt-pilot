"use client";

import { useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, Download, ScanSearch, ShieldAlert, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { formatCurrency, formatDate, localizeMoneyText } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialSecurity } from "@/lib/types";

const tone = (score: number) => (score >= 75 ? "text-leaf" : score >= 45 ? "text-amber-600" : "text-rose-600");
const bar = (score: number) => (score >= 75 ? "bg-leaf" : score >= 45 ? "bg-amber-400" : "bg-rose-500");
const SEVERITY = { high: "bg-rose-100 text-rose-700", medium: "bg-amber-100 text-amber-700", low: "bg-sage text-olive" };

function Tile({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full flex-col gap-3 rounded-card bg-white p-5 shadow-sm print:break-inside-avoid print:border print:border-mist print:shadow-none", className)}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-sage" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className={cn(score >= 75 ? "stroke-leaf" : score >= 45 ? "stroke-amber-400" : "stroke-rose-500")} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cn("text-4xl font-semibold tnum", tone(score))}>{score}</p>
          <p className="text-xs text-graphite">Grade {grade}</p>
        </div>
      </div>
    </div>
  );
}

export default function FinancialSecurityPage() {
  const userId = useUserId();
  const facts = useAsync(useCallback(() => api.financialSecurity(userId), [userId]), [userId]);
  const brief = useAsync(useCallback(() => api.financialSecurityBrief(userId), [userId]), [userId]);
  const d: FinancialSecurity | null = facts.data ?? null;
  const b = brief.data;

  if (facts.loading && !d) return <p className="py-20 text-center text-sm text-pewter">Checking your financial data…</p>;
  if (!d) return <p className="py-20 text-center text-sm text-rose-600">Could not load financial security. {facts.error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Financial Security</h1>
          <p className="text-sm text-graphite">How safe your own money data looks: duplicates, odd payments, look-alike merchants and more. {formatDate(d.generated_at)}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href="/evidence-room" className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-4 py-2 text-sm text-ink hover:bg-fog">
            <ScanSearch className="size-4" /> Evidence Council
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-medium text-ink hover:brightness-95">
            <Download className="size-4" /> Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title="Security score">
          <ScoreRing score={d.score} grade={d.grade} />
          <p className="text-center text-xs text-graphite">Risk level: <span className="font-semibold capitalize text-ink">{d.risk_level}</span></p>
        </Tile>
        <Tile title="Money in question">
          <p className="text-3xl font-semibold tnum text-ink">{formatCurrency(d.amount_at_risk)}</p>
          <p className="text-sm text-graphite">in {d.flagged_transactions} flagged transactions out of {d.transactions_checked} checked.</p>
        </Tile>
        <Tile title="Findings by severity">
          <div className="flex gap-2">
            {(["high", "medium", "low"] as const).map((s) => (
              <div key={s} className={cn("flex-1 rounded-2xl p-3 text-center", SEVERITY[s])}>
                <p className="text-2xl font-semibold tnum">{d.severity_counts[s]}</p>
                <p className="text-[11px] capitalize">{s}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-graphite">{d.findings_total} findings in total</p>
        </Tile>
        <Tile title="Weakest area" className="bg-lime/30">
          {(() => {
            const w = [...d.pillars].sort((x, y) => x.score - y.score)[0];
            return (
              <>
                <p className="text-xl font-semibold text-ink">{w.label}</p>
                <p className="text-sm text-graphite">{w.hint}</p>
                <p className="text-sm font-medium text-ink">Scores {w.score}/100 with {w.findings} finding{w.findings === 1 ? "" : "s"}.</p>
              </>
            );
          })()}
        </Tile>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Tile title="Where your data is safe or at risk" className="lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2">
            {d.pillars.map((p) => (
              <div key={p.key} className="rounded-2xl bg-sage/50 p-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{p.label}</span>
                  <span className={cn("font-semibold tnum", tone(p.score))}>{p.score}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className={cn("h-full rounded-full", bar(p.score))} style={{ width: `${p.score}%` }} />
                </div>
                <p className="mt-2 text-xs text-graphite">
                  {p.findings ? `${p.findings} finding${p.findings === 1 ? "" : "s"} · ${formatCurrency(p.amount_at_risk)}` : "All clear"}
                </p>
              </div>
            ))}
          </div>
        </Tile>

        <Tile title="Copilot's analysis" className="bg-tint-lime/60 lg:col-span-5">
          {brief.loading && !b ? (
            <p className="animate-pulse text-sm text-graphite">FinPilot is reading your security data…</p>
          ) : b ? (
            <div className="space-y-3 text-sm text-ink">
              <p className="flex items-start gap-2 font-semibold"><Sparkles className="mt-0.5 size-4 shrink-0 text-olive" />{b.headline}</p>
              <p className="leading-relaxed text-graphite">{b.summary}</p>
              {b.actions.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-olive">What to do</p>
                  <ol className="list-decimal space-y-1 pl-5">{b.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
                </div>
              )}
              <p className="text-[11px] text-pewter">Written by FinPilot from your own records{b.source === "rules" ? " (offline summary)" : ""}.</p>
            </div>
          ) : (
            <p className="text-sm text-graphite">The analysis is not available right now.</p>
          )}
        </Tile>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Tile title="Top findings" className="lg:col-span-7">
          {d.top_findings.length === 0 ? (
            <p className="py-6 text-center text-sm text-pewter">No problems found.</p>
          ) : (
            <ul className="space-y-2">
              {d.top_findings.map((f, i) => (
                <li key={i} className="flex items-start gap-3 rounded-2xl bg-fog/60 p-3 text-sm">
                  <span className={cn("mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", SEVERITY[f.severity])}>{f.severity}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{localizeMoneyText(f.title, { absolute: true })}</p>
                    <p className="text-xs text-graphite">{localizeMoneyText(f.detail, { absolute: true })}</p>
                  </div>
                  {f.amount > 0 && <span className="shrink-0 font-semibold tnum text-ink">{formatCurrency(f.amount)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile title="Your accounts" className="lg:col-span-5">
          <ul className="space-y-2">
            {d.accounts.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-fog/60 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{a.name}</p>
                  <p className="text-xs capitalize text-graphite">{a.type.replace("_", " ")} · {a.transactions} transactions</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tnum text-ink">{formatCurrency(a.balance)}</p>
                  {a.flagged > 0 ? (
                    <p className="flex items-center justify-end gap-1 text-xs text-rose-600"><AlertTriangle className="size-3" />{a.flagged} flagged</p>
                  ) : (
                    <p className="flex items-center justify-end gap-1 text-xs text-leaf"><ShieldAlert className="size-3" />clean</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Tile>
      </div>
      <p className="text-[11px] text-pewter">Checks run on your own transactions and accounts. They point at things worth a look, not proof of fraud.</p>
    </div>
  );
}
