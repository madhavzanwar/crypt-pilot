"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import type { GraphNode } from "@/lib/crypto/api";
import { middleEllipsis } from "@/lib/crypto/demoWallets";
import { cn } from "@/lib/utils";
import { useGuardT } from "../guard/copy";
import { ShapeIcon } from "./GraphLegend";

const TONE: Record<GraphNode["label"], string> = {
  illicit: "bg-rose-50 text-rose-800 border-rose-200",
  licit: "bg-emerald-50 text-emerald-800 border-emerald-200",
  unknown: "bg-slate-100 text-slate-700 border-slate-300",
};

/**
 * Side panel for a clicked wallet (bottom sheet on phones). Rendered inside the graph stage rather than as a modal,
 * so the graph stays usable; Escape or the close button dismisses it.
 */
export function NodeDrawer({ node, onClose }: { node: GraphNode | null; onClose: () => void }) {
  const { g } = useGuardT();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!node) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [node, onClose]);

  if (!node) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the full address is in the title attribute */
    }
  };
  const why = node.isSubject ? g("wg.node.why.subject") : g(`wg.node.why.${node.label}`);
  return (
    <aside
      aria-label={g("wg.node.title")}
      className={cn(
        "absolute z-20 flex flex-col gap-3 border border-black/[0.08] bg-white/95 p-4 shadow-xl backdrop-blur",
        "inset-x-2 bottom-2 max-h-[70%] overflow-auto rounded-surface sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-72",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{g("wg.node.title")}</h4>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={g("wg.node.close")}
          className="-m-1 inline-flex size-9 cursor-pointer items-center justify-center rounded-chip text-graphite hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-xs text-ink" title={node.id}>{middleEllipsis(node.id, 10, 8)}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={g("wg.node.copy")}
          className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-chip text-graphite hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
        >
          {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          <span className="sr-only" role="status">{copied ? g("wg.node.copied") : ""}</span>
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-xs">
        <dt className="text-pewter">{g("wg.node.label")}</dt>
        <dd>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold", TONE[node.label])}>
            <ShapeIcon label={node.label} />
            {g(`wg.label.${node.label}`)}
          </span>
        </dd>
        <dt className="text-pewter">{g("wg.node.hop")}</dt>
        <dd className="tnum font-semibold text-ink">{node.hop}</dd>
        {node.riskScore !== undefined && (
          <>
            <dt className="text-pewter">{g("wg.node.risk")}</dt>
            <dd className="tnum font-semibold text-ink">{Math.round(node.riskScore)}</dd>
          </>
        )}
      </dl>
      <p className="text-xs leading-relaxed text-graphite">{why}</p>
    </aside>
  );
}
