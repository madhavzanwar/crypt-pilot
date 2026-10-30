import type { ForecastRiskQuery } from "@/lib/types";

/** The text boxes of the Forecast & Risk form, exactly as typed. */
export interface ForecastDraft {
  reserve: string;
  savings: string;
  extra_debt: string;
  goal_amount: string;
  goal_month: string;
  cut: string;
  sims: string;
  seed: string;
}
export type DraftErrors = Partial<Record<keyof ForecastDraft, string>>;

/** The forecasting engine's own default seed (backend/app/plan/forecast.py SEED): a blank seed and the first run use it. */
export const DEFAULT_SEED = 20240601;

const blank = (s: string) => s.trim() === "";
const asNum = (s: string) => (blank(s) ? undefined : Number(s));

/**
 * Validates the form against the rules the API enforces, so the person sees the problem next to the field instead of
 * a failed request. Returns the query when everything is valid.
 */
export function validateDraft(d: ForecastDraft, q: ForecastRiskQuery, horizon: number): { errors: DraftErrors; query: ForecastRiskQuery | null } {
  const errors: DraftErrors = {};
  const money = (k: "reserve" | "savings" | "extra_debt", label: string) => {
    const n = asNum(d[k]);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) errors[k] = `${label} must be 0 or more.`;
  };
  money("reserve", "Cash reserve");
  money("savings", "Extra savings");
  money("extra_debt", "Extra debt repayment");

  const goalAmount = asNum(d.goal_amount);
  const goalMonth = asNum(d.goal_month);
  if (goalAmount !== undefined && (!Number.isFinite(goalAmount) || goalAmount <= 0)) errors.goal_amount = "Savings goal must be more than 0.";
  if (goalMonth !== undefined && (!Number.isInteger(goalMonth) || goalMonth < 1 || goalMonth > horizon))
    errors.goal_month = `Goal month must be a whole number from 1 to ${horizon} (the forecast horizon).`;
  if (goalAmount !== undefined && goalMonth === undefined && !errors.goal_amount) errors.goal_month = "Enter the month by which you want to reach the goal, or clear the goal amount.";
  if (goalMonth !== undefined && goalAmount === undefined && !errors.goal_month) errors.goal_amount = "Enter the goal amount, or clear the goal month.";

  const cut = blank(d.cut) ? 20 : Number(d.cut);
  if (!Number.isFinite(cut) || cut < 0 || cut > 30) errors.cut = "Discretionary cut must be between 0 and 30 percent.";
  const sims = blank(d.sims) ? 2000 : Number(d.sims);
  if (!Number.isInteger(sims) || sims < 500 || sims > 10000) errors.sims = "Simulations must be a whole number from 500 to 10,000.";
  const seed = blank(d.seed) ? DEFAULT_SEED : Number(d.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 32 - 1) errors.seed = "Seed must be a whole number from 0 to 4,294,967,295.";

  if (Object.keys(errors).length > 0) return { errors, query: null };
  return {
    errors,
    query: {
      ...q,
      reserve: asNum(d.reserve), savings: asNum(d.savings), extra_debt: asNum(d.extra_debt),
      goal_amount: goalAmount, goal_month: goalMonth, cut: cut / 100, sims, seed,
    },
  };
}

/**
 * A request failure as a sentence for people: never the URL, the query string or a JSON body.
 * `raw` is the Error message from lib/api ("API /path?x=1 failed: 422 {...}").
 */
export function friendlyForecastError(raw: string | null | undefined): string {
  const text = raw ?? "";
  const status = /failed:\s*(\d{3})/.exec(text)?.[1];
  const detail = /"msg"\s*:\s*"([^"]{1,160})"/.exec(text)?.[1] ?? /"detail"\s*:\s*"([^"]{1,160})"/.exec(text)?.[1];
  if (status === "422" || status === "400") {
    const why = detail ? ` (${detail.replace(/^Value error, /, "")})` : "";
    return `Some of the values you entered cannot be used${why}. Check the highlighted fields and run it again.`;
  }
  if (status === "401" || status === "403") return "You need to sign in again to run the forecast.";
  if (status === "429") return "Too many forecast runs in a short time. Wait a minute and try again.";
  if (status && status.startsWith("5")) return "The forecast service had a problem. Try again in a moment.";
  if (/failed to fetch|network|load failed/i.test(text)) return "Could not reach the forecast service. Check your connection and try again.";
  // lib/api already turns most failures into a sentence for people: keep it rather than replacing it with a generic line
  const t = text.trim();
  if (t && t.length <= 240 && !/^API\s|[{}<>]|https?:\/\//.test(t)) return t;
  return "The forecast could not be run. Try again, or change the inputs.";
}
