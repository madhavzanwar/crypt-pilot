"use client";

import { useState } from "react";
import { ChevronDown, Link2, Wallet } from "lucide-react";
import WalletVerdictCard from "@/components/crypto/guard/WalletVerdictCard";
import { shortAddress } from "@/lib/crypto/address/validate";
import { VERDICT_META } from "@/lib/crypto/verdict";
import { cn } from "@/lib/utils";
import type { ChainWallet } from "./types";

/** Engine tag: the TigerGraph badge appears only when the service said engine === "tigergraph"; otherwise the engine that answered is named. */
export function EngineTag({ w }: { w: Pick<ChainWallet, "tigergraph" | "engine_label" | "ms" | "status"> }) {
  if (w.status === "offline") return <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] font-semibold text-graphite">Chain Analyst offline</span>;
  const ms = w.ms !== null ? ` · ${w.ms} ms` : "";
  return w.tigergraph ? (
    <span className="rounded-full bg-tint-ember px-2 py-0.5 text-[10px] font-semibold text-ink ring-1 ring-ember/30">TigerGraph{ms}</span>
  ) : (
    <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] font-semibold text-graphite">{w.engine_label ?? "Graph service"}{ms}</span>
  );
}

export function VerdictChip({ w }: { w: ChainWallet }) {
  if (!w.verdict) return <span className="rounded-full border border-mist bg-fog px-2 py-0.5 text-[11px] font-semibold text-graphite">Offline</span>;
  const m = VERDICT_META[w.verdict];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", m.chip)}>
      <Icon className="size-3" aria-hidden /> {w.verdict === "UNKNOWN" ? "NOT IN DATASET" : m.word}
    </span>
  );
}

/** The facts of one wallet as chips: verdict, risk score, hops to the nearest illicit wallet, OFAC hit, engine tag. */
export function ChainChips({ w }: { w: ChainWallet }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <VerdictChip w={w} />
      {w.risk_score !== null && <span className="text-[11px] text-graphite tnum">risk {w.risk_score}/100</span>}
      {w.status === "ok" && <span className="text-[11px] text-graphite tnum">{w.hops !== null ? `${w.hops} hop${w.hops === 1 ? "" : "s"} to illicit` : "no illicit wallet nearby"}</span>}
      {w.ofac && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">OFAC hit</span>}
      <EngineTag w={w} />
    </div>
  );
}

/** One wallet row: address, chips and the one-line reason. */
export function WalletLine({ w }: { w: ChainWallet }) {
  return (
    <li className="grid gap-1 rounded-xl bg-fog/70 p-2.5">
      <span className="font-mono text-[11px] text-ink" title={w.address} translate="no" lang="en">{shortAddress(w.address, 8, 6)}</span>
      <ChainChips w={w} />
      <p className="text-xs text-graphite">{w.reason}</p>
      {w.mock && <p className="text-[10px] text-pewter">Demo dataset, not real chain data.</p>}
    </li>
  );
}

/** The wallet checks behind a Chain Analyst result. */
export function WalletList({ wallets }: { wallets: ChainWallet[] }) {
  return <ul className="grid gap-1.5">{wallets.map((w) => <WalletLine key={w.address} w={w} />)}</ul>;
}

/** "Graph evidence" disclosure. The full card is mounted only when opened, because it runs its own check. */
export function GraphEvidence({ address }: { address: string | null }) {
  const [open, setOpen] = useState(false);
  if (!address) return null;
  return (
    <div className="rounded-2xl border border-mist bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-ink">
        <Link2 className="size-4 text-leaf" /> Graph evidence
        <span className="font-mono text-xs font-normal text-pewter" translate="no" lang="en">{shortAddress(address, 8, 6)}</span>
        <ChevronDown className={cn("ml-auto size-4 text-pewter transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-2 px-4 pb-4">
          <p className="text-xs text-graphite">The full check for the first screened wallet. Opening this runs a fresh check (a repeat within 10 minutes is served from cache).</p>
          <WalletVerdictCard address={address} />
        </div>
      )}
    </div>
  );
}

/** Invitation shown while no wallet is listed: the Chain Analyst does not run. */
export function AddWalletInvite({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-dashed border-mist bg-white/70 text-graphite", compact ? "p-3 text-xs" : "p-4 text-sm")}>
      <Wallet className="size-4 shrink-0 text-pewter" aria-hidden />
      <span><span className="font-semibold text-ink">Chain Analyst: Add a wallet to screen.</span> It checks wallets you pay or hold against a transaction graph and votes with the council.</span>
    </div>
  );
}

/** First wallet worth showing in Graph evidence: one the service answered about, else the first listed. */
export function firstScreened(wallets: ChainWallet[] | undefined, listed: string[]): string | null {
  return wallets?.find((w) => w.status !== "offline")?.address ?? listed[0] ?? null;
}
