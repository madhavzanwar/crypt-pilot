/** Pure helpers for "Who owes who" and "Delete my data" (no React, unit-tested). */
import type { SharedExpensesSummary, SharedMember, SharedTransfer } from "./types";

export const DELETE_WORD = "DELETE";
/** Case-sensitive: only the exact word enables the final delete button. */
export const isDeleteConfirmed = (typed: string): boolean => typed.trim() === DELETE_WORD;

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export interface ExpenseDraft { title: string; amount: string; paidBy: string; split: string[]; date: string }
export type ExpenseErrors = Partial<Record<"title" | "amount" | "paidBy" | "split" | "date", string>>;
export const MAX_AMOUNT = 1e8;

/** Mirrors the backend contract: title 1-120, 0 < amount <= 1e8, known payer, non-empty split, date 2000-01-01..tomorrow. */
export function validateExpense(d: ExpenseDraft, memberIds: string[], now: Date = new Date()): ExpenseErrors {
  const e: ExpenseErrors = {};
  const title = d.title.trim();
  if (!title) e.title = "Enter what the expense was for.";
  else if (title.length > 120) e.title = "Keep the title under 120 characters.";
  const amount = Number(d.amount);
  if (!d.amount.trim() || !Number.isFinite(amount) || amount <= 0) e.amount = "Enter an amount greater than zero.";
  else if (amount > MAX_AMOUNT) e.amount = "That amount is too large.";
  if (!memberIds.includes(d.paidBy)) e.paidBy = "Choose who paid.";
  if (d.split.length === 0) e.split = "Choose at least one person to split with.";
  else if (d.split.some((id) => !memberIds.includes(id))) e.split = "Choose people from this household.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) e.date = "Enter a valid date.";
  else {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (d.date < "2000-01-01") e.date = "The date cannot be before 2000.";
    else if (d.date > todayISO(tomorrow)) e.date = "The date cannot be in the future.";
  }
  return e;
}

/** Name for a member id; ids that left the household resolve through `former` ("Former member"). */
export const memberName = (members: SharedMember[], id: string, former: { id: string; name: string }[] = []): string =>
  members.find((m) => m.id === id)?.name ?? former.find((m) => m.id === id)?.name ?? "Former member";

/** Transfers with names resolved; the amount is left for the caller to format. */
export function namedTransfers(s: SharedExpensesSummary): { from: string; to: string; fromName: string; toName: string; amount: number }[] {
  return s.transfers.map((t: SharedTransfer) => ({ ...t, fromName: memberName(s.members, t.from, s.former_members), toName: memberName(s.members, t.to, s.former_members) }));
}

export const isWritable = (s: SharedExpensesSummary): boolean => !s.sample && !s.read_only;

const COUNT_LABELS: Record<string, string> = {
  transactions: "transactions", accounts: "accounts", goals: "goals", budgets: "budgets", documents: "documents", debts: "debts",
  incomes: "income sources", rules: "rules", connections: "connections", households: "households", household_members: "household memberships",
  shared_expenses: "shared expenses", settlements: "settlements",
};
/** "12 transactions, 3 goals" from the non-zero counts the server returns. */
export function describeDeleted(deleted: Record<string, number>): string[] {
  return Object.entries(deleted)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n.toLocaleString("en-IN")} ${COUNT_LABELS[k] ?? k.replace(/_/g, " ")}`);
}
