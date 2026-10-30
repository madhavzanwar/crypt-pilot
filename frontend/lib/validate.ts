/** Client-side input rules. Each validator returns an error message, or null when the value is fine.
 *  Keep the limits in sync with the backend validation (timeline events, fraud simulator, tax, forecast). */

export const MAX_AMOUNT = 100_000_000; // 10 crore: well above any personal transaction
export const MAX_FUTURE_DAYS = 366; // timeline events may be logged up to a year ahead
export const MAX_TEXT = 120;

const DAY = 86_400_000;

export function validateAmount(raw: string | number | null | undefined, label = "Amount"): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return `Enter ${label.toLowerCase()}.`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n <= 0) return `${label} must be greater than 0.`;
  if (n > MAX_AMOUNT) return `${label} is too large (the maximum is ${MAX_AMOUNT.toLocaleString("en-IN")}).`;
  return null;
}

export function validateText(raw: string, label = "Description"): string | null {
  const t = raw.trim();
  if (!t) return `${label} is required.`;
  if (t.length > MAX_TEXT) return `${label} must be ${MAX_TEXT} characters or fewer.`;
  return null;
}

/** `iso` is YYYY-MM-DD. `now` is injectable for tests. */
export function validateEventDate(iso: string, now: Date = new Date()): string | null {
  if (!iso) return "Pick a date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Pick a valid date.";
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return "Pick a valid date.";
  if (t > now.getTime() + MAX_FUTURE_DAYS * DAY) return "That date is too far in the future (one year at most).";
  if (t < Date.UTC(2000, 0, 1)) return "That date is too far in the past.";
  return null;
}

export type NumRule = { label: string; min?: number; max?: number; integer?: boolean; required?: boolean };

/** Optional numeric field (empty is fine unless `required`). */
export function validateNumber(raw: string, r: NumRule): string | null {
  if (raw.trim() === "") return r.required ? `${r.label} is required.` : null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${r.label} must be a number.`;
  if (r.integer && !Number.isInteger(n)) return `${r.label} must be a whole number.`;
  if (r.min !== undefined && n < r.min) return `${r.label} must be at least ${r.min.toLocaleString("en-IN")}.`;
  if (r.max !== undefined && n > r.max) return `${r.label} must be at most ${r.max.toLocaleString("en-IN")}.`;
  return null;
}

export const FORECAST_RULES = {
  reserve: { label: "Cash reserve", min: 0, max: MAX_AMOUNT },
  cut: { label: "Discretionary cut", min: 0, max: 30, required: true },
  savings: { label: "Extra savings", min: 0, max: MAX_AMOUNT },
  extra_debt: { label: "Extra debt repayment", min: 0, max: MAX_AMOUNT },
  goal_amount: { label: "Savings goal", min: 0, max: MAX_AMOUNT },
  goal_month: { label: "Goal month", min: 1, max: 60, integer: true },
  sims: { label: "Simulations", min: 500, max: 10_000, integer: true, required: true },
  seed: { label: "Random seed", min: 0, max: 2_147_483_647, integer: true, required: true },
} satisfies Record<string, NumRule>;

export type ForecastField = keyof typeof FORECAST_RULES;

export function validateForecast(d: Record<ForecastField, string>): Partial<Record<ForecastField, string>> {
  const out: Partial<Record<ForecastField, string>> = {};
  for (const k of Object.keys(FORECAST_RULES) as ForecastField[]) {
    const e = validateNumber(d[k], FORECAST_RULES[k]);
    if (e) out[k] = e;
  }
  // A goal needs both parts.
  if (!out.goal_amount && !out.goal_month) {
    if (d.goal_amount.trim() && !d.goal_month.trim()) out.goal_month = "Add the month you want to reach the goal by.";
    if (d.goal_month.trim() && !d.goal_amount.trim()) out.goal_amount = "Add the savings goal amount.";
  }
  return out;
}

/** Gross annual income for the tax calculator. */
export function validateGross(raw: string | number): string | null {
  if (String(raw).trim() === "") return "Enter your gross income.";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Gross income must be a number.";
  if (n < 0) return "Gross income cannot be negative.";
  if (n > 10_000_000_000) return "Gross income is too large.";
  return null;
}

/** "credit_card_payment" -> "Credit card payment". */
export function humanize(slug: string): string {
  const s = slug.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Replaces machine slugs inside prose ("credit_card_payment spend") with plain words. */
export function humanizeSlugs(text: string): string {
  return text.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => m.replace(/_/g, " "));
}

/** Goal target date (YYYY-MM-DD, optional): must be today or later. `now` is injectable for tests. */
export function validateTargetDate(iso: string, now: Date = new Date()): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return "Pick a valid target date.";
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (iso < today) return "The target date is in the past. Pick today or a later date.";
  return null;
}
