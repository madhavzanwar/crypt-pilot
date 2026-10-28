import type { Engine, Verdict } from "@/lib/crypto/api";

/** One wallet as the Chain Analyst reports it (backend/app/security/chain_analyst.py, snake_case like the rest of FinPilot's council). */
export interface ChainWallet {
  address: string;
  status: "ok" | "not_in_dataset" | "offline";
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
