"use client";

import { Card } from "@/components/ui/Card";
import type { CheckResponse } from "@/lib/crypto/api";
import { useGuardT } from "./copy";

const ROWS = ["hop1", "hop2", "hop3"] as const;

/** Neighbour counts by hop, limitations and model info. Everything here comes straight from the response. */
export default function DetailsPanel({ result }: { result: CheckResponse }) {
  const { g } = useGuardT();
  const limits = [...new Set([...result.limitations, g("wg.honesty")])];
  const f1 = result.model.illicitF1Test;
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <section aria-labelledby="wg-nb-title">
        <h3 id="wg-nb-title" className="mb-2 text-sm font-semibold text-ink">{g("wg.neighbours.title")}</h3>
        <div className="overflow-x-auto rounded-surface border border-black/[0.08]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-fog text-left text-xs text-graphite">
                <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">{g("wg.graph.list.hop")}</span></th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{g("wg.neighbours.illicit")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{g("wg.neighbours.licit")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{g("wg.neighbours.unknown")}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const c = result.neighbors[r];
                return (
                  <tr key={r} className="border-t border-black/[0.05]">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-ink">{g("wg.neighbours.hop", { n: i + 1 })}</th>
                    {c ? (
                      <>
                        <td className="tnum px-3 py-2 text-right">{c.illicit}</td>
                        <td className="tnum px-3 py-2 text-right">{c.licit}</td>
                        <td className="tnum px-3 py-2 text-right">{c.unknown}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-right text-xs text-pewter">{g("wg.neighbours.na")}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="wg-lim-title">
        <h3 id="wg-lim-title" className="mb-2 text-sm font-semibold text-ink">{g("wg.limits.title")}</h3>
        <ul className="grid gap-2">
          {limits.map((l) => (
            <li key={l} className="flex gap-2.5 text-sm text-graphite">
              <span aria-hidden className="mt-[7px] size-[7px] flex-none rotate-45 bg-ink/60" />
              <span className="min-w-0">{l}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex flex-wrap gap-x-2 text-[11px] text-pewter">
        <span>{g("wg.model")}: <code className="font-mono">{result.model.name}</code></span>
        {typeof f1 === "number" && <span className="tnum">F1 {f1.toFixed(3)}</span>}
        {result.graphFeatures.componentSize !== undefined && <span className="tnum">cluster {result.graphFeatures.componentSize}</span>}
      </p>
    </Card>
  );
}
