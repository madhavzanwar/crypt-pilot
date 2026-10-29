"use client";

import { useEffect, useId, useState } from "react";
import { Cpu, Zap } from "lucide-react";
import type { CheckResponse, Verdict } from "@/lib/crypto/api";
import { METER_TICKS, VERDICT_META } from "@/lib/crypto/verdict";
import { cn } from "@/lib/utils";
import { useGuardT, verdictWord } from "./copy";

/** Icon + word + tint. Never colour alone. */
export function VerdictBadge({ verdict, size = "md", className }: { verdict: Verdict; size?: "sm" | "md" | "lg"; className?: string }) {
  const { uiLang } = useGuardT();
  const meta = VERDICT_META[verdict];
  const Icon = meta.icon;
  return (
    <span
      data-verdict={verdict}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-display font-semibold tracking-wide",
        meta.chip,
        size === "sm" && "px-2.5 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        size === "lg" && "px-4 py-2 text-lg sm:text-xl",
        className,
      )}
    >
      <Icon className={cn(size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4")} aria-hidden />
      <span>{meta.word}</span>
      {uiLang === "hi" && <span className="sr-only">{verdictWord(uiLang, verdict)}</span>}
    </span>
  );
}

const ARC = { cx: 80, cy: 78, r: 66 };
const pointAt = (v: number, r: number) => {
  const a = Math.PI * (1 - v / 100);
  return { x: ARC.cx + r * Math.cos(a), y: ARC.cy - r * Math.sin(a) };
};

/** 0-100 risk gauge: a half-circle meter with ticks at the policy bands. "n/a" when the wallet is not in the dataset. */
export function RiskGauge({ score, verdict, size = "md" }: { score: number | null; verdict: Verdict; size?: "sm" | "md" }) {
  const { g } = useGuardT();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score ?? 0)); // the fill animates in from 0
    return () => cancelAnimationFrame(id);
  }, [score]);
  const meta = VERDICT_META[verdict];
  const na = score === null;
  const value = na ? 0 : Math.round(score);
  const stroke: Record<Verdict, string> = {
    ALLOW: "stroke-emerald-500",
    WARN: "stroke-amber-500",
    BLOCK: "stroke-rose-500",
    UNKNOWN: "stroke-slate-400",
  };
  const a11y = na
    ? ({ role: "img", "aria-label": `${g("wg.gauge.label")}: ${g("wg.gauge.na")}` } as const)
    : ({
        role: "meter",
        "aria-label": g("wg.gauge.label"),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": value,
        "aria-valuetext": g("wg.gauge.value", { n: value }),
      } as const);

  if (size === "sm") {
    return (
      <div className="flex items-center gap-3" {...a11y}>
        <span className="tnum font-display text-2xl font-semibold leading-none text-ink">{na ? g("wg.gauge.na") : value}</span>
        <div className="relative h-2.5 min-w-0 flex-1 rounded-full bg-black/[0.07]">
          {!na && (
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 motion-reduce:transition-none", meta.solid)}
              style={{ width: `${Math.max(0, Math.min(100, shown))}%` }}
            />
          )}
          {METER_TICKS.map((t) => (
            <span key={t} aria-hidden className="absolute -inset-y-0.5 w-px bg-ink/40" style={{ left: `${t}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const d = `M ${ARC.cx - ARC.r} ${ARC.cy} A ${ARC.r} ${ARC.r} 0 0 1 ${ARC.cx + ARC.r} ${ARC.cy}`;
  return (
    <div className="relative mx-auto w-full max-w-[260px]" {...a11y}>
      <svg viewBox="0 0 160 96" className="block w-full" aria-hidden>
        <path d={d} pathLength={100} fill="none" strokeWidth={11} strokeLinecap="round" className="stroke-black/[0.08]" />
        {!na && (
          <path
            d={d}
            pathLength={100}
            fill="none"
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, Math.min(100, shown))} 100`}
            className={cn(stroke[verdict], "transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none")}
          />
        )}
        {METER_TICKS.map((t) => {
          const a = pointAt(t, ARC.r - 10);
          const b = pointAt(t, ARC.r + 10);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1.4} className="stroke-ink/50" />;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="tnum font-display text-4xl font-semibold leading-none text-ink">{na ? g("wg.gauge.na") : value}</span>
        <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-pewter">
          {na ? g("wg.gauge.label") : `${g("wg.gauge.label")} / 100`}
        </span>
      </div>
    </div>
  );
}

/**
 * Which graph engine answered. The TigerGraph badge (ms, query name, View GSQL) appears ONLY when the API says
 * `engine === "tigergraph"`. Any other engine gets a neutral label naming the engine that really answered.
 */
export function EngineBadge({ result, compact = false }: { result: CheckResponse; compact?: boolean }) {
  const { g } = useGuardT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const { engine, tigergraph, replay } = result;
  const ms = Math.round(tigergraph.ms);
  const mock = result.isMock ? (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{g("wg.engine.example")}</span>
  ) : null;

  if (engine === "tigergraph") {
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid="tigergraph-badge">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-chip border border-ember/25 bg-orange-50 px-3 py-2 text-xs text-ink">
          <Zap className="size-4 flex-none text-ember-dark" aria-hidden />
          <span className="font-semibold">{g("wg.engine.tigergraph", { ms })}</span>
          {!compact && <code className="min-w-0 break-all font-mono text-[11px] text-graphite" translate="no" lang="en">{tigergraph.queryName}</code>}
          {mock}
          {!compact && tigergraph.gsql && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen((o) => !o)}
              className="ml-auto min-h-8 cursor-pointer rounded-chip px-2 font-semibold text-ember-dark underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            >
              {open ? g("wg.gsql.hide") : g("wg.gsql.view")}
            </button>
          )}
        </div>
        {!compact && tigergraph.gsql && (
          <pre
            id={id}
            hidden={!open}
            className="max-h-72 max-w-full overflow-auto rounded-surface bg-ink p-3 font-mono text-[11px] leading-relaxed text-white/90"
          >
            <code>{tigergraph.gsql}</code>
          </pre>
        )}
      </div>
    );
  }

  const isReplay = Boolean(replay) || engine === "replay";
  const text = isReplay
    ? g("wg.engine.replay")
    : engine === "networkx"
      ? g("wg.engine.networkx", { ms })
      : g("wg.engine.other", { name: engine ?? tigergraph.queryName, ms });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="engine-label">
      <span className="inline-flex min-w-0 items-center gap-2 rounded-chip border border-black/[0.08] bg-fog px-3 py-2 text-xs font-medium text-graphite">
        <Cpu className="size-4 flex-none" aria-hidden />
        <span className="min-w-0">{text}</span>
      </span>
      {mock}
    </div>
  );
}
