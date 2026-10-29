import type { Engine, Verdict } from "@/lib/crypto/api";

export type ChainWalletStatus = "ok" | "not_in_dataset" | "offline" | "rate_limited" | "rejected";

/** Statuses where the service gave no verdict about the wallet. */
export const NO_ANSWER: readonly ChainWalletStatus[] = ["offline", "rate_limited", "rejected"];

/** Wallets that must never read as safe: no answer, or UNKNOWN. Mirrors chain_analyst.unverified_count(). */
export const isUnverified = (w: Pick<ChainWallet, "status">): boolean => w.status !== "ok";

/**
 * Extra fields the council verdict carries when wallets were requested (backend/app/security/council.py):
 * `unverified` (count) and `caveat` (sentence), plus `chain.unverified` and `chain.offline`.
 */
export interface UnverifiedInfo {
  unverified?: number;
  caveat?: string;
}

/** One wallet as the Chain Analyst reports it (backend/app/security/chain_analyst.py, snake_case like the rest of FinPilot's council). */
export interface ChainWallet {
  address: string;
  /**
   * Contract with backend/app/security/chain_analyst.py (Agent B, BUG-016/017):
   *  - ok / not_in_dataset: the service gave a verdict (not_in_dataset = UNKNOWN, which is NOT a safe signal);
   *  - offline: network error or 5xx; rate_limited: HTTP 429 (retry in a minute); rejected: HTTP 400 (address refused).
   * The last three have `verdict === null` and are all "unverified".
   */
  status: ChainWalletStatus;
  verdict: Verdict | null;
  risk_score: number | null;
  hops: number | null;
  ofac: boolean;
  reason: string;
  engine: Engine | null;
  engine_label: string | null;
  /** True only when the crypto service answered with engine === "tigergraph". */
  tigergraph: boolean;
  /** Query time measured by the graph engine, in ms. */
  ms: number | null;
  rtt_ms: number;
  vote: "high" | "medium" | "low" | null;
  mock: boolean;
  limitations: string[];
}

/** The Chain Analyst's vote in the Risk Council stream (extends the council's vote shape). */
export interface ChainVote {
  agent: "chain_analyst";
  name: string;
  score: number;
  level: "low" | "medium" | "high" | "abstain";
  why: string;
  do: string;
  source: "graph";
  round: number;
  abstain: boolean;
  chain: { wallets: ChainWallet[] };
}

export const isChainVote = (v: { agent: string }): v is ChainVote => v.agent === "chain_analyst";

export const CHAIN_AGENT = {
  id: "chain_analyst",
  name: "Chain Analyst",
  job: "Screens crypto wallets you pay or hold against a transaction graph",
} as const;

export const MAX_WALLETS = 5;

/** The `chain` payload carried by a Chain Analyst finding in the Evidence Council report. */
export type ChainFindingData = Omit<ChainWallet, "status" | "vote">;

/** Evidence Council finding extended with the Chain Analyst's fields (`info` = shown but not a problem: ALLOW / not in dataset). */
export interface ChainFinding {
  agent: string;
  info?: boolean;
  chain?: ChainFindingData;
}

export const toWallet = (c: ChainFindingData): ChainWallet => ({ ...c, status: c.verdict === "UNKNOWN" ? "not_in_dataset" : "ok", vote: null });
