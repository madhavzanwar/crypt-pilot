/** Turns an API error response into a short, friendly sentence. Never includes the request URL or raw JSON. */

type Issue = { type?: string; loc?: unknown[]; msg?: string; ctx?: Record<string, unknown> };

const FIELD_NAMES: Record<string, string> = {
  reserve: "Cash reserve", savings: "Extra savings", extra_debt: "Extra debt repayment", goal_amount: "Savings goal",
  goal_month: "Goal month", cut: "Discretionary cut", sims: "Simulations", seed: "Random seed",
  amount: "Amount", gross: "Gross income", gross_income: "Gross income", merchant: "Merchant", description: "Description",
  date: "Date", horizon: "Horizon", wallet: "Wallet",
};

const humanField = (loc: unknown[] | undefined): string => {
  const key = [...(loc ?? [])].reverse().find((p) => typeof p === "string" && !["body", "query", "path"].includes(p)) as string | undefined;
  if (!key) return "A value";
  return FIELD_NAMES[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
};

function describeIssue(i: Issue): string {
  const f = humanField(i.loc);
  const ctx = i.ctx ?? {};
  switch (i.type) {
    case "greater_than_equal": return `${f} must be at least ${String(ctx.ge ?? 0)}.`;
    case "greater_than": return `${f} must be greater than ${String(ctx.gt ?? 0)}.`;
    case "less_than_equal": return `${f} must be at most ${String(ctx.le ?? "the allowed maximum")}.`;
    case "less_than": return `${f} must be less than ${String(ctx.lt ?? "the allowed maximum")}.`;
    case "missing": return `${f} is required.`;
    case "string_too_short": return `${f} is too short.`;
    case "string_too_long": return `${f} is too long.`;
    default: return `${f} is not valid.`;
  }
}

/** Message for a failed response. `text` is the raw body; `status` the HTTP status. */
export function formatApiError(status: number, text: string): string {
  if (status === 401) return "Please sign in again to continue.";
  if (status === 403) return "You do not have access to that.";
  if (status === 404) return "We could not find that.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  try {
    const detail = (JSON.parse(text) as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) {
      const msgs = (detail as Issue[]).slice(0, 2).map(describeIssue);
      return [...new Set(msgs)].join(" ");
    }
  } catch {
    // not JSON
  }
  return "That request could not be completed. Please check your inputs and try again.";
}

/** The backend refused a chat message that looked like a seed phrase or private key (400 {error:"secret_input", detail}). `message` is the friendly detail. */
export class SecretInputError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "SecretInputError";
  }
}

/** Returns the friendly detail when `text` is a secret_input rejection body, else null. */
export function secretInputDetail(status: number, text: string): string | null {
  if (status !== 400) return null;
  try {
    const body = JSON.parse(text) as { error?: unknown; detail?: unknown };
    if (body.error !== "secret_input") return null;
    return typeof body.detail === "string" && body.detail.trim()
      ? body.detail
      : "This looks like a seed phrase or a private key. Never share it with anyone, including this chat.";
  } catch {
    return null;
  }
}
