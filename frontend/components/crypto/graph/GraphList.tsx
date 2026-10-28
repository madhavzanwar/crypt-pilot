"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { GraphNode } from "@/lib/crypto/api";
import { middleEllipsis } from "@/lib/crypto/demoWallets";
import { cn } from "@/lib/utils";
import { useGuardT } from "../guard/copy";
import { ShapeIcon } from "./GraphLegend";

/** "Graph as a list": the screen-reader friendly (and copy-friendly) version of the canvas. Collapsed by default. */
export function GraphList({ nodes }: { nodes: GraphNode[] }) {
  const { g } = useGuardT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const sorted = [...nodes].sort((a, b) => a.hop - b.hop || a.id.localeCompare(b.id));
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-chip px-2 text-sm font-semibold text-ink transition-colors hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
      >
        <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-90")} />
        {g("wg.graph.list")}
        <span className="tnum font-normal text-pewter">({nodes.length})</span>
      </button>
      <div id={id} hidden={!open} className="mt-2 max-h-[360px] overflow-auto rounded-surface border border-black/[0.08] bg-white">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{g("wg.graph.list")}</caption>
          <thead className="sticky top-0 bg-fog text-left text-xs text-graphite">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{g("wg.graph.list.wallet")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{g("wg.graph.list.label")}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{g("wg.graph.list.hop")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((n) => (
              <tr key={n.id} className="border-t border-black/[0.05]">
                <td className="px-3 py-2">
                  <span className="font-mono text-xs" title={n.id}>{middleEllipsis(n.id, 8, 6)}</span>
                  {n.isSubject && <span className="ml-2 text-xs text-pewter">{g("wg.graph.list.subject")}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <ShapeIcon label={n.label} />
                    {g(`wg.label.${n.label}`)}
                  </span>
                </td>
                <td className="tnum px-3 py-2 text-right">{n.hop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
