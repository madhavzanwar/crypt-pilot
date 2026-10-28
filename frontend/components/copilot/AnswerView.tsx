"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Database, ExternalLink, Search, TrendingUp, Zap } from "lucide-react";
import type { AnswerContract, Recommendation } from "@/lib/types";
import { ConfidenceChip } from "@/components/ui/ConfidenceChip";
import { Chip } from "@/components/ui/Chip";
import { formatCurrency, formatImpactValue } from "@/lib/format";
import { cn } from "@/lib/utils";

function getSimulatorUrl(rec: Recommendation): string {
  const { action, action_params } = rec;
  const p = (action_params || {}) as Record<string, unknown>;

  if (action === "cancel_subscription") {
    const rawGroupId =
      p.group_id ??
      (Array.isArray(p.group_ids) && p.group_ids.length > 0 ? p.group_ids[0] : "");
    const groupId = encodeURIComponent(String(rawGroupId ?? ""));
    return `/simulate?action=cancel_subscription&groupId=${groupId}`;
  }

  if (action === "prepay_debt") {
    const debtId = encodeURIComponent(String(p.debt_id ?? ""));
    const amount = encodeURIComponent(String(p.extra_payment ?? 2000));
    return `/simulate?action=prepay_debt&debtId=${debtId}&amount=${amount}`;
  }

  if (action === "increase_sip") {
    const amount = encodeURIComponent(String(p.amount ?? 3000));
    return `/simulate?action=increase_sip&amount=${amount}`;
  }

  return `/simulate?action=${encodeURIComponent(action)}`;
}

export function AnswerView({ answer }: { answer: AnswerContract }) {
  const { facts, predictions, recommendations, data_gaps, narrative, nugen_narrative, nugen_confidence, next_steps, sources } = answer;
  const isEmpty =
    facts.length === 0 && predictions.length === 0 && recommendations.length === 0 && !narrative;

  if (isEmpty) {
    return <p className="text-sm text-pewter">No insights available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {narrative && <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{narrative}</p>}

      {nugen_narrative && (
        <div className="rounded-2xl bg-tint-lime/70 p-4 text-sm leading-relaxed text-graphite">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-olive">
            Second opinion{typeof nugen_confidence === "number" ? ` · ${Math.round(nugen_confidence)}% sure` : ""}
          </p>
          {nugen_narrative}
        </div>
      )}

      {next_steps && next_steps.length > 0 && (
        <section className="rounded-2xl bg-tint-lime p-4 ring-1 ring-lime/50">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-olive">What to do next</h4>
          <ol className="flex flex-col gap-3">
            {next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-lime text-xs font-bold text-ink">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink">{s.title}</p>
                    {s.when && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-olive">{s.when}</span>}
                  </div>
                  {s.why && <p className="text-xs leading-relaxed text-graphite">{s.why}</p>}
                  {s.link &&
                    (s.link.startsWith("/") ? (
                      <Link href={s.link} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-lime/60">
                        Open <ArrowRight className="size-3" />
                      </Link>
                    ) : (
                      <a href={s.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-lime/60">
                        Open <ExternalLink className="size-3" />
                      </a>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Lane 1: Observed Facts */}
      {facts.length > 0 && (
        <CopilotLane
          title="From your records"
          hint="Checked against your real transactions"
          badgeColor="bg-leaf"
          icon={<Database className="h-3 w-3 text-white" />}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {facts.map((f, i) => {
              const textHasValue = /[₹%]|\d+\s*\/\s*\d+/.test(f.text);
              return (
                <li
                  key={i}
                  title={f.source_txn_ids?.length ? `Source transactions: ${f.source_txn_ids.join(", ")}` : "From your ledger"}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-sage/60 px-3.5 py-3 text-sm"
                >
                  <span className="flex items-start gap-2 text-ink">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
                    {f.text}
                  </span>
                  {f.value !== null && !textHasValue ? <span className="shrink-0 font-semibold tnum text-ink">{formatCurrency(f.value)}</span> : null}
                </li>
              );
            })}
          </ul>
        </CopilotLane>
      )}

      {/* Lane 2: Predicted Modeling */}
      {predictions.length > 0 && (
        <CopilotLane
          title="Model Predictions"
          hint="Forward-looking cash flow and volatility estimates"
          badgeColor="bg-indigo-600"
          icon={<TrendingUp className="h-3 w-3 text-white" />}
        >
          <div className="rounded-surface border border-indigo-100 bg-indigo-50/20 p-4 shadow-sm">
            <ul className="flex flex-col gap-3.5">
              {predictions.map((p, i) => (
                <li key={i} className="flex flex-col gap-2 text-sm bg-white/80 p-3.5 rounded-xl border border-indigo-100/70 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{p.text}</span>
                    <ConfidenceChip value={p.confidence} />
                  </div>

                  {(p.range_low !== null || p.range_high !== null) && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-graphite">
                      <span className="text-pewter">Confidence interval:</span>
                      <span className="tnum font-medium text-ink bg-white px-2 py-0.5 rounded border border-black/[0.06]">
                        {p.range_low !== null ? formatCurrency(p.range_low) : "?"} &ndash;{" "}
                        {p.range_high !== null ? formatCurrency(p.range_high) : "?"}
                      </span>
                    </div>
                  )}

                  {/* Prediction Basis / Citations */}
                  {p.basis && (
                    <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 bg-indigo-50/70 px-2.5 py-1 rounded-md border border-indigo-150">
                      <Search className="h-3 w-3 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-indigo-700">Model Basis:</span>
                      <span className="text-graphite">{p.basis}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CopilotLane>
      )}

      {/* Lane 3: Recommended Actions */}
      {recommendations.length > 0 && (
        <CopilotLane
          title="Recommended Actions"
          hint="Simulated impact on your net worth and health score"
          badgeColor="bg-ember"
          icon={<Zap className="h-3 w-3 text-white" />}
        >
          <div className="flex flex-col gap-3.5">
            {recommendations.map((r, i) => (
              <div
                key={i}
                className="rounded-surface border border-ember/25 bg-gradient-to-b from-white to-orange-50/25 p-4 sm:p-5 shadow-[0_2px_12px_rgba(255,89,0,0.04)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-ember shrink-0" />
                    <span>{r.text}</span>
                  </p>
                  <ConfidenceChip value={r.confidence} />
                </div>

                <p className="mt-1.5 text-xs text-graphite pl-4 leading-relaxed">{r.rationale}</p>

                {/* Before vs After Impact Visual Pill */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-black/[0.06] text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-pewter">{r.impact.metric}:</span>
                    <span className="text-graphite line-through tnum">
                      {formatImpactValue(r.impact.metric, r.impact.before)}
                    </span>
                    <span className="text-pewter">→</span>
                    <span className="font-bold text-ink tnum">
                      {formatImpactValue(r.impact.metric, r.impact.after)}
                    </span>
                    <span
                      className={cn(
                        "font-bold tnum px-1.5 py-0.5 rounded",
                        r.impact.delta >= 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      )}
                    >
                      ({r.impact.delta >= 0 ? "+" : ""}
                      {formatImpactValue(r.impact.metric, r.impact.delta)})
                    </span>
                  </div>

                  <Chip tone="outline" className="text-[10px]">
                    Horizon: {r.impact.horizon}
                  </Chip>
                </div>

                {/* Prominent Action Button for What-If Simulator */}
                <div className="mt-4 pt-3.5 border-t border-black/[0.06] flex items-center justify-end">
                  <Link
                    href={getSimulatorUrl(r)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lime hover:bg-lime-dark text-ink text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.98] group/btn border border-black/10"
                    aria-label={`Test ${r.text} in What-If Simulator`}
                  >
                    <span className="text-amber-400">⚡</span>
                    <span>Test in What-If Simulator</span>
                    <ArrowRight className="h-3.5 w-3.5 text-pewter group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-all" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CopilotLane>
      )}

      {/* Data Gaps Section */}
      {data_gaps.length > 0 && (
        <div className="rounded-surface border border-dashed border-black/[0.12] bg-fog/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-pewter" />
            <span>Identified Data Gaps & Model Caveats</span>
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {data_gaps.map((g, i) => (
              <li key={i} className="text-xs text-graphite flex items-start gap-1.5">
                <span className="text-pewter">•</span>
                <div>
                  <span className="font-medium text-ink">{g.text}</span>
                  <span className="text-pewter"> — {g.what_would_help}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sources && sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-pewter">Sources</span>
          <span className="rounded-full bg-tint-lime px-1.5 py-0.5 text-[9px] font-semibold text-olive">Live web</span>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="rounded-full border border-black/[0.08] px-2.5 py-0.5 text-[11px] text-graphite hover:bg-fog hover:text-ink">
              {hostOf(s.url)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function CopilotLane({
  title,
  hint,
  badgeColor,
  icon,
  children,
}: {
  title: string;
  hint: string;
  badgeColor: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-white shadow-2xs",
              badgeColor
            )}
            aria-hidden
          >
            {icon}
          </span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink">{title}</h4>
        </div>
        <span className="text-[11px] text-pewter">{hint}</span>
      </header>
      {children}
    </section>
  );
}
