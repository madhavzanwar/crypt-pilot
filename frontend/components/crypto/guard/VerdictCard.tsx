"use client";

import { useState, type ReactNode } from "react";
import { Check, CircleCheck, Copy, Info, Route, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CheckResponse } from "@/lib/crypto/api";
import { middleEllipsis } from "@/lib/crypto/demoWallets";
import { VERDICT_META } from "@/lib/crypto/verdict";
import { cn } from "@/lib/utils";
import { useGuardT } from "./copy";
import { EngineBadge, RiskGauge, VerdictBadge } from "./parts";

function Notice({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <p className={cn("flex items-start gap-2 rounded-surface px-3 py-2 text-xs", tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-fog text-graphite")}>
      <Icon className="mt-px size-4 flex-none" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function CopyAddress({ value }: { value: string }) {
  const { g } = useGuardT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={g("wg.node.copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-chip text-graphite hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
    >
      {done ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}

function Fact({ icon, title, value, tone = "neutral" }: { icon: ReactNode; title: string; value: string; tone?: "neutral" | "bad" | "good" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-surface border p-3",
        tone === "bad" ? "border-rose-200 bg-rose-50/60" : tone === "good" ? "border-emerald-200 bg-emerald-50/50" : "border-black/[0.06] bg-fog",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-pewter">
        {icon}
        <span className="min-w-0">{title}</span>
      </div>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

/**
 * The full verdict: icon + word + one honest line, the 0-100 gauge, hops to the nearest flagged wallet,
 * OFAC / Ransomwhere hits, engine badge, top reasons, notices and the permanent honesty line.
 */
export default function VerdictCard({ result }: { result: CheckResponse }) {
  const { g } = useGuardT();
  const meta = VERDICT_META[result.verdict];
  const found = result.status === "ok";
  const hops = result.hopsToNearestIllicit;
  const showHits = found || result.labelHits.ofac || result.labelHits.ransomwhere;

  return (
    <Card className="relative overflow-hidden p-5 pl-6 sm:p-6 sm:pl-7" data-verdict={result.verdict} aria-label={meta.word}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", meta.solid)} />
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col items-start gap-3">
          <VerdictBadge verdict={result.verdict} size="lg" />
          <p className="text-[15px] font-medium leading-snug text-ink">{g(`wg.verdict.${result.verdict}.line`)}</p>
          {(result.verdict === "UNKNOWN" || result.status === "not_in_dataset") && (
            <p role="note" data-testid="unknown-not-safe" className="rounded-surface border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
              {g("wg.unknown.notsafe")}
            </p>
          )}
        </div>

        <RiskGauge score={result.riskScore} verdict={result.verdict} />

        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate font-mono text-xs text-graphite" title={result.address}>
            {middleEllipsis(result.address, 12, 8)}
          </span>
          <CopyAddress value={result.address} />
        </div>

        {found && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Fact
              icon={<Route className="size-3.5" aria-hidden />}
              title={g("wg.hops.title")}
              value={hops === null ? g("wg.hops.none") : g(hops === 1 ? "wg.hops.one" : "wg.hops.other", { n: hops })}
              tone={hops !== null && hops <= 1 ? "bad" : "neutral"}
            />
            {showHits && (
              <>
                <Fact
                  icon={result.labelHits.ofac ? <ShieldAlert className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                  title="OFAC"
                  value={g(result.labelHits.ofac ? "wg.hits.match" : "wg.hits.nomatch")}
                  tone={result.labelHits.ofac ? "bad" : "neutral"}
                />
                <Fact
                  icon={result.labelHits.ransomwhere ? <ShieldAlert className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                  title="Ransomwhere"
                  value={g(result.labelHits.ransomwhere ? "wg.hits.match" : "wg.hits.nomatch")}
                  tone={result.labelHits.ransomwhere ? "bad" : "neutral"}
                />
              </>
            )}
          </div>
        )}

        {result.datasetLabel && (
          <p className="text-xs text-graphite">
            {g("wg.dataset.label", { label: g(`wg.label.${result.datasetLabel}`) })}
          </p>
        )}

        {found && <EngineBadge result={result} />}

        {result.topReasons.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">{g("wg.reasons.title")}</h3>
            <ul className="grid gap-2">
              {result.topReasons.map((r, i) => (
                <li key={`${i}-${r}`} className="flex gap-2.5 text-sm text-graphite">
                  <span aria-hidden className={cn("mt-[7px] size-[7px] flex-none rotate-45", meta.solid)} />
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(result.isMock || result.replay || result.cached || result.truncated || result.creditsRemaining !== undefined) && (
          <div className="grid gap-1.5">
            {result.isMock && <Notice tone="warn">{g("wg.notice.mock")}</Notice>}
            {result.replay && <Notice tone="info">{g("wg.notice.replay")}</Notice>}
            {result.cached && <Notice tone="info">{g("wg.credits.cached")}</Notice>}
            {result.truncated && <Notice tone="info">{g("wg.notice.truncated")}</Notice>}
            {result.creditsRemaining !== undefined && (
              <p className="tnum text-xs font-medium text-graphite" data-testid="credits-left">
                {g("wg.credits.left", { n: result.creditsRemaining })}
              </p>
            )}
          </div>
        )}

        <p className="text-xs leading-relaxed text-pewter">{g("wg.honesty")}</p>
      </div>
    </Card>
  );
}
