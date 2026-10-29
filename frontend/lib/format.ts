const CURRENCY_RATES: Record<string, { rate: number; locale: string }> = {
  INR: { rate: 1, locale: "en-IN" },
  USD: { rate: 0.0116, locale: "en-US" },
  EUR: { rate: 0.0107, locale: "de-DE" },
  GBP: { rate: 0.009, locale: "en-GB" },
  AED: { rate: 0.0425, locale: "ar-AE" },
  SGD: { rate: 0.0153, locale: "en-SG" },
};

/** Read the saved currency code without ever throwing (storage can be blocked). */
export function readSavedCurrency(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("finpilot_currency");
  } catch {
    return null;
  }
}

/**
 * Format an amount that is stored in INR into `code`. Values that round to
 * zero (including -0 and -0.3) never get a minus sign ("-₹0" is a bug).
 */
export function formatMoney(
  amountInINR: number,
  code: string = "INR",
  options?: { showCents?: boolean },
): string {
  const cfg = CURRENCY_RATES[code] ?? CURRENCY_RATES.INR;
  const isINR = !CURRENCY_RATES[code] || code === "INR";
  const converted = (Number.isFinite(amountInINR) ? amountInINR : 0) * cfg.rate;
  const maxDigits = options?.showCents ? 2 : isINR || Math.abs(converted) >= 100 ? 0 : 2;
  const factor = 10 ** maxDigits;
  const rounded = Math.round(converted * factor) / factor;
  const safe = rounded === 0 ? 0 : converted; // drops the sign of -0 and of tiny negatives
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: isINR ? "INR" : code,
      maximumFractionDigits: maxDigits,
      minimumFractionDigits: options?.showCents ? 2 : 0,
    }).format(safe);
  } catch {
    return `${Math.round(safe).toLocaleString()}`;
  }
}

export function formatCurrency(value: number, currencyCode?: string): string {
  if (currencyCode) return formatMoney(value, currencyCode);
  const saved = readSavedCurrency();
  return formatMoney(value, saved && CURRENCY_RATES[saved] ? saved : "INR");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * ImpactEstimate.metric is a free-text string from the backend (e.g.
 * "Interest paid (12mo)", "Emergency fund months", "Health score"), so we
 * can't know its unit precisely. Heuristic: metrics whose label suggests a
 * score/rate/percent or whose magnitude is small (months, ratios, score
 * points) render as a plain number; everything else renders as currency.
 */
// Word-boundary matches only -- "months"/"days" as a counted UNIT (e.g.
// "Emergency fund months", "days until first gap") are plain numbers, but
// "monthly" as an ADJECTIVE describing a rupee amount (e.g. "monthly free
// cash flow", "monthly 'dining' spend") must still render as currency. A
// plain substring check on "month" conflated these two and rendered rupee
// amounts like "monthly free cash flow" as a bare number instead of ₹.
const _PLAIN_NUMBER_METRIC_RE = /\b(score|rate|percent|months?|days?)\b/i;

export function formatImpactValue(metric: string, value: number): string {
  const looksLikePlainNumber = _PLAIN_NUMBER_METRIC_RE.test(metric);
  if (looksLikePlainNumber || Math.abs(value) < 50) {
    return Number.isInteger(value) ? value.toString() : value.toFixed(1);
  }
  return formatCurrency(value);
}
