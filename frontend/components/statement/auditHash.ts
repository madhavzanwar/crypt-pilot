import { canonicalJson } from "@/lib/crypto/api/reportHash";
import { sha256Hex } from "@/lib/crypto/sha256";
import type { Account, DashboardSnapshot, Transaction } from "@/lib/types";

/**
 * The statement's audit hash: SHA-256 of the canonical JSON of the figures the statement prints. Anyone holding the
 * same figures can recompute it (the canonical JSON is shown next to the hash), so a changed figure changes the hash.
 *
 * Canonical JSON = keys sorted, no whitespace, money as fixed 2-decimal strings (floats are not allowed in the
 * canonical form). Transactions are covered by a second SHA-256 over one line per transaction, sorted by id.
 * Personal data stays out: no names, merchants or account numbers are part of the figures, only amounts, dates and ids.
 */
/** Fallback only; the real period comes from `statementPeriod()` (BUG-040). */
export const STATEMENT_PERIOD_FALLBACK = "unknown";
export const STATEMENT_HASH_VERSION = 1;

export interface StatementData {
  userId: string;
  dashboard: DashboardSnapshot;
  accounts: Account[];
  transactions: Transaction[];
}

/** "YYYY-MM" of the statement window: the month of the newest transaction, else of the dashboard snapshot. */
export function statementPeriod(d: Pick<StatementData, "dashboard" | "transactions">): string {
  let newest = "";
  for (const t of d.transactions) if (t.date > newest) newest = t.date;
  const src = /^\d{4}-\d{2}/.test(newest) ? newest : d.dashboard.generated_at ?? "";
  return /^\d{4}-\d{2}/.test(src) ? src.slice(0, 7) : STATEMENT_PERIOD_FALLBACK;
}

const money = (n: number): string => (Math.round((Number.isFinite(n) ? n : 0) * 100) / 100).toFixed(2);

/** One line per transaction, sorted by id: the leaf data behind `transactions.sha256`. */
export function transactionLines(transactions: Transaction[]): string[] {
  return [...transactions]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => `${t.id}|${t.date}|${money(t.amount)}|${t.category}|${t.account_id}`);
}

export function statementFigures(d: StatementData): Record<string, unknown> {
  const { dashboard, accounts, transactions } = d;
  const pts = dashboard.forecast.points ?? [];
  const first = pts[0];
  const last = pts[pts.length - 1];
  const at = (p: { p10: number; p50: number; p90: number } | undefined) =>
    p ? { p10: money(p.p10), p50: money(p.p50), p90: money(p.p90) } : null;
  return {
    version: STATEMENT_HASH_VERSION,
    period: statementPeriod(d),
    account: d.userId,
    health: {
      overall: Math.round(dashboard.health_score.overall),
      subScores: dashboard.health_score.sub_scores.map((s) => ({ name: s.name, score: Math.round(s.score) })),
    },
    monthly: { income: money(dashboard.monthly_income), expenses: money(dashboard.monthly_expenses) },
    netWorth: money(dashboard.net_worth),
    accounts: accounts.map((a) => `${a.id}|${a.type}|${money(a.balance)}`).sort(),
    debts: dashboard.debts.map((x) => money(x.principal)).sort(),
    forecast: { days: pts.length, start: at(first), end: at(last) },
    transactions: { count: transactions.length, sha256: sha256Hex(transactionLines(transactions).join("\n")) },
  };
}

export interface StatementDigest {
  /** 64 lowercase hex characters. */
  hex: string;
  /** "0x" + hex: a bytes32, so it can be attested on-chain as is. */
  bytes32: string;
  /** The exact string that was hashed. */
  canonical: string;
}

export function statementDigest(d: StatementData): StatementDigest {
  const canonical = canonicalJson(statementFigures(d));
  const hex = sha256Hex(canonical);
  return { hex, bytes32: `0x${hex}`, canonical };
}
