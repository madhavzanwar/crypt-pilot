"use client";

import type { NodeLabel } from "@/lib/crypto/api";
import { cn } from "@/lib/utils";
import { useGuardT } from "../guard/copy";

/** Same shapes as the canvas: illicit = diamond, licit = circle, unknown = square. Colour is never the only cue. */
export function ShapeIcon({ label, className }: { label: NodeLabel | "subject"; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 flex-none", className)} aria-hidden>
      {label === "subject" && (
        <>
          <circle cx="8" cy="8" r="7" className="fill-none stroke-ink" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="4.6" className="fill-ink" />
          <circle cx="8" cy="8" r="1.8" className="fill-ember" />
        </>
      )}
      {label === "illicit" && <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" className="fill-rose-500" />}
      {label === "licit" && <circle cx="8" cy="8" r="5.5" className="fill-emerald-500" />}
      {label === "unknown" && <rect x="3" y="3" width="10" height="10" rx="1" className="fill-white stroke-slate-400" strokeWidth="2" />}
    </svg>
  );
}

export function GraphLegend() {
  const { g } = useGuardT();
  const items = [
    { label: "subject" as const, text: g("wg.graph.legend.subject") },
    { label: "illicit" as const, text: g("wg.graph.legend.illicit") },
    { label: "licit" as const, text: g("wg.graph.legend.licit") },
    { label: "unknown" as const, text: g("wg.graph.legend.unknown") },
  ];
  return (
    <ul aria-label={g("wg.graph.legend")} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-graphite">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <ShapeIcon label={i.label} />
          {i.text}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 16" className="h-4 w-6 flex-none" aria-hidden>
          <path d="M1 8h17" className="stroke-pewter" strokeWidth="1.5" />
          <path d="M16 3.5 22 8l-6 4.5Z" className="fill-pewter" />
        </svg>
        {g("wg.graph.legend.arrow")}
      </li>
    </ul>
  );
}
