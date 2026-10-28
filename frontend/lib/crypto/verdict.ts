import { CircleHelp, ShieldCheck, ShieldX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { NodeLabel, Verdict } from "@/lib/crypto/api";

/**
 * Everything the UI needs to render a verdict: always an icon + a word + a tint, never colour alone.
 * Classes use FinPilot's Tailwind palette (emerald / amber / rose / slate), not Cryptiq's design system.
 */
export interface VerdictMeta {
  icon: LucideIcon;
  /** Upper-case word shown in the badge (kept in English everywhere: it is a product term). */
  word: string;
  /** Tinted pill: background + border + text. */
  chip: string;
  /** Soft tinted panel (verdict card header). */
  panel: string;
  /** Solid fill for meter bars and accent strips. */
  solid: string;
  /** Text colour that is AA on white. */
  text: string;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  ALLOW: {
    icon: ShieldCheck,
    word: "ALLOW",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    panel: "bg-emerald-50/70 border-emerald-200",
    solid: "bg-emerald-500",
    text: "text-emerald-800",
  },
  WARN: {
    icon: TriangleAlert,
    word: "WARN",
    chip: "bg-amber-50 text-amber-800 border-amber-300",
    panel: "bg-amber-50/70 border-amber-300",
    solid: "bg-amber-500",
    text: "text-amber-800",
  },
  BLOCK: {
    icon: ShieldX,
    word: "BLOCK",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    panel: "bg-rose-50/70 border-rose-200",
    solid: "bg-rose-500",
    text: "text-rose-800",
  },
  UNKNOWN: {
    icon: CircleHelp,
    word: "UNKNOWN",
    chip: "bg-slate-100 text-slate-700 border-slate-300",
    panel: "bg-slate-100/80 border-slate-300",
    solid: "bg-slate-400",
    text: "text-slate-700",
  },
};

/** Tick marks on the risk meter (the backend's policy bands: ALLOW below 30, BLOCK from 70). */
export const METER_TICKS = [30, 70] as const;

/** Node label -> text for the evidence graph and list (shapes live in the graph components). */
export const NODE_LABEL_TEXT: Record<NodeLabel, string> = {
  illicit: "Illicit",
  licit: "Licit",
  unknown: "Unknown",
};

/** One short, plain-text line for sharing or speech: verdict + score + hops. */
export function summarizeVerdict(r: {
  verdict: Verdict;
  riskScore: number | null;
  hopsToNearestIllicit: number | null;
}): string {
  const score = r.riskScore === null ? "not in the dataset" : `risk ${Math.round(r.riskScore)}/100`;
  const hops =
    r.hopsToNearestIllicit === null
      ? "no flagged wallet within 3 hops"
      : `nearest flagged wallet ${r.hopsToNearestIllicit} hop${r.hopsToNearestIllicit === 1 ? "" : "s"} away`;
  return `${r.verdict}: ${score}, ${hops}`;
}
