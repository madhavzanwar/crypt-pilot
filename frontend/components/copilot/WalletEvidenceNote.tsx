"use client";

import type { CheckResponse } from "@/lib/crypto/api";
import { useVoiceT } from "@/lib/crypto/voice/strings";

/**
 * Plain-language read-out of the graph evidence behind a wallet verdict. Built only from the fields of the
 * service response (no model call). TigerGraph is named only when the service says `engine === "tigergraph"`.
 */
export function WalletEvidenceNote({ result }: { result: CheckResponse }) {
  const { tr } = useVoiceT();
  const lines: string[] = [];
  const engineName = result.engine === "tigergraph" ? "TigerGraph" : result.engine === "networkx" ? "the local NetworkX graph" : result.engine === "replay" ? "a pre-recorded replay" : null;

  if (result.status === "error") {
    lines.push(`The check did not finish${result.error ? ` (${result.error})` : ""}, so there is no evidence to explain.`);
  } else {
    if (engineName) {
      lines.push(
        `Engine: ${engineName}${result.tigergraph?.queryName ? `, query ${result.tigergraph.queryName}` : ""}${typeof result.tigergraph?.ms === "number" ? `, ${result.tigergraph.ms} ms` : ""}.`,
      );
    }
    if (result.status === "not_in_dataset") {
      lines.push("This address is not in the labelled dataset, so the graph has no history to compare it with. That is not proof it is safe.");
    } else {
      const { hop1, hop2 } = result.neighbors;
      lines.push(`Direct counterparties: ${hop1.illicit} flagged illicit, ${hop1.licit} licit, ${hop1.unknown} unknown. Two steps away: ${hop2.illicit} illicit, ${hop2.licit} licit, ${hop2.unknown} unknown.`);
      if (result.hopsToNearestIllicit !== null) {
        lines.push(`The nearest flagged-illicit wallet is ${result.hopsToNearestIllicit} ${result.hopsToNearestIllicit === 1 ? "hop" : "hops"} away.`);
      }
    }
    if (result.labelHits.ofac || result.labelHits.ransomwhere) {
      const lists = [result.labelHits.ofac ? "OFAC sanctions list" : null, result.labelHits.ransomwhere ? "Ransomwhere" : null].filter(Boolean).join(" and ");
      lines.push(`Matched on: ${lists}.`);
    }
    if (result.topReasons.length > 0) lines.push(`Main reasons: ${result.topReasons.slice(0, 3).join("; ")}.`);
    if (result.riskScore !== null) lines.push(`Risk score ${result.riskScore}/100, verdict ${result.verdict}.`);
    if (result.isMock || result.replay) lines.push(result.replay ? "This answer is a pre-recorded replay, not a live query." : "This answer comes from demo data.");
    if (result.truncated) lines.push("The graph search was cut short on a very busy wallet, so counts may be low.");
  }

  return (
    <div className="rounded-2xl bg-tint-lime/70 p-4 text-sm leading-relaxed text-graphite">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-olive">{tr("cp.evidence.title")}</p>
      <ul className="grid gap-1">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
