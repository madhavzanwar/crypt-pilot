"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Coins, Loader2, ShieldAlert } from "lucide-react";
import { openCreditsDrawer } from "@/components/crypto/credits/openCredits";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CheckResponse, Lang } from "@/lib/crypto/api";
import { middleEllipsis } from "@/lib/crypto/demoWallets";
import { useWalletCheck } from "@/lib/crypto/useWalletCheck";
import { VERDICT_META } from "@/lib/crypto/verdict";
import { cn } from "@/lib/utils";
import { useGuardT } from "./copy";
import { EngineBadge, RiskGauge, VerdictBadge } from "./parts";

/**
 * Compact, self-contained card for the Copilot chat: runs the check once for `address` on mount (a repeat of the
 * same address within 10 minutes is shown from memory, never re-charged) and renders verdict, key facts, engine
 * badge and a link to the full experience. Handles loading, error and out-of-credits (402) states.
 */
export default function WalletVerdictCard({
  address,
  lang,
  onResult,
}: {
  address: string;
  lang?: Lang;
  onResult?: (response: CheckResponse) => void;
}) {
  const { g, reqLang } = useGuardT();
  const reqL: Lang = lang ?? reqLang;
  const { state, run } = useWalletCheck();
  const ranFor = useRef<string | null>(null);
  const latchedLang = useRef<Lang>(reqL); // the language of the first run: a later language switch must not start a paid re-check
  const reported = useRef<CheckResponse | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // One check per address (the language is latched at the first run): StrictMode double effects and re-renders do not repeat it.
  useEffect(() => {
    if (ranFor.current === address) return;
    ranFor.current = address;
    latchedLang.current = reqL;
    void run(address, latchedLang.current, { reuse: true });
  }, [address, reqL, run]);

  useEffect(() => {
    if (state.phase === "done" && reported.current !== state.result) {
      reported.current = state.result;
      onResultRef.current?.(state.result);
    }
  }, [state]);

  const href = `/wallet-guard?address=${encodeURIComponent(address)}&run=1`;
  const link = (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1 rounded-chip text-xs font-semibold text-ink underline decoration-ember decoration-2 underline-offset-4 hover:text-ember-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
    >
      {g("wg.card.open")}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
  const head = (
    <span className="min-w-0 truncate font-mono text-[11px] text-graphite" title={address} translate="no" lang="en">
      {middleEllipsis(address, 10, 8)}
    </span>
  );

  if (state.phase === "idle" || state.phase === "checking") {
    return (
      <Card className="flex w-full min-w-0 max-w-md flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-xs font-semibold text-graphite">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {g("wg.card.checking")}
        </div>
        {head}
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-2.5 w-full rounded-full" />
      </Card>
    );
  }

  if (state.phase === "error") {
    const credits = state.action === "open-credits";
    const secret = state.action === "seed-phrase-warning";
    return (
      <Card role="alert" className={cn("flex w-full min-w-0 max-w-md flex-col gap-3 p-4", credits ? "border-amber-300 bg-amber-50" : "border-rose-200 bg-rose-50")}>
        <div className="flex items-start gap-2.5">
          {credits ? <Coins className="mt-0.5 size-4 flex-none text-amber-800" aria-hidden /> : secret ? <ShieldAlert className="mt-0.5 size-4 flex-none text-rose-700" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 flex-none text-rose-700" aria-hidden />}
          <p className="min-w-0 text-sm text-ink">{secret ? g("wg.secret.body") : state.message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {credits ? (
            <button
              type="button"
              onClick={openCreditsDrawer}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-chip border border-lime-dark/40 bg-lime px-3 text-xs font-semibold text-ink hover:bg-lime-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            >
              <Coins className="size-4" aria-hidden />
              {g("wg.error.credits.cta")}
            </button>
          ) : !secret && state.action !== "fix-address" ? (
            <button
              type="button"
              onClick={() => void run(address, reqL)}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-chip border border-black/[0.1] bg-white px-3 text-xs font-semibold text-ink hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            >
              {g("wg.error.retry")}
            </button>
          ) : null}
          {!secret && link}
        </div>
      </Card>
    );
  }

  const r = state.result;
  const meta = VERDICT_META[r.verdict];
  const found = r.status === "ok";
  const hops = r.hopsToNearestIllicit;
  const facts: string[] = [];
  if (found) {
    facts.push(hops === null ? g("wg.card.hops.none") : g(hops === 1 ? "wg.hops.one" : "wg.hops.other", { n: hops }));
    if (r.labelHits.ofac) facts.push(`OFAC: ${g("wg.hits.match")}`);
    if (r.labelHits.ransomwhere) facts.push(`Ransomwhere: ${g("wg.hits.match")}`);
    const n1 = r.neighbors.hop1;
    facts.push(`${g("wg.neighbours.hop", { n: 1 })}: ${n1.illicit} ${g("wg.label.illicit")}, ${n1.licit} ${g("wg.label.licit")}, ${n1.unknown} ${g("wg.label.unknown")}`);
  }
  return (
    <Card className="relative flex w-full min-w-0 max-w-md flex-col gap-3 overflow-hidden p-4 pl-5" data-verdict={r.verdict}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", meta.solid)} />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <VerdictBadge verdict={r.verdict} size="md" />
        {head}
      </div>
      <p className="text-sm font-medium leading-snug text-ink">{g(`wg.verdict.${r.verdict}.line`)}</p>
      {(r.verdict === "UNKNOWN" || r.status === "not_in_dataset") && (
        <p role="note" className="rounded-surface border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800">{g("wg.unknown.notsafe")}</p>
      )}
      <RiskGauge score={r.riskScore} verdict={r.verdict} size="sm" />
      {facts.length > 0 && (
        <ul className="grid gap-1 text-xs text-graphite">
          {facts.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className={cn("mt-[6px] size-[6px] flex-none rotate-45", meta.solid)} />
              <span className="min-w-0">{f}</span>
            </li>
          ))}
        </ul>
      )}
      {found && <EngineBadge result={r} compact />}
      {(r.cached || state.reused) && <p className="text-[11px] text-graphite">{state.reused ? g("wg.credits.reused") : g("wg.credits.cached")}</p>}
      {r.isMock && <p className="text-[11px] font-medium text-amber-800">{g("wg.notice.mock")}</p>}
      <p className="text-[11px] leading-relaxed text-pewter">{g("wg.honesty")}</p>
      <div>{link}</div>
    </Card>
  );
}
