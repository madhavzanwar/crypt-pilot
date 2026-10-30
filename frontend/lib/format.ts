const CURRENCY_RATES: Record<string, { rate: number; locale: string }> = {
  INR: { rate: 1, locale: "en-IN" },
  USD: { rate: 0.0116, locale: "en-US" },
  EUR: { rate: 0.0107, locale: "de-DE" },
  GBP: { rate: 0.009, locale: "en-GB" },
  AED: { rate: 0.0425, locale: "en-AE" },
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
 * Format an amount that is stored in INR into `code`. Mirrors components/ui/money.ts (keep the two in step):
 * sign before the symbol ("-₹303", never "₹-303"), narrow symbols, no negative zero, Latin digits for AED.
 */
export function formatMoney(
  amountInINR: number,
  code: string = "INR",
  options?: { showCents?: boolean },
): string {
  const cfg = CURRENCY_RATES[code] ?? CURRENCY_RATES.INR;
  const isINR = !CURRENCY_RATES[code] || code === "INR";
  const value = (Number.isFinite(amountInINR) ? amountInINR : 0) * cfg.rate;
  const abs = Math.abs(value);
  const digits = options?.showCents ? 2 : isINR || abs >= 100 ? 0 : 2;
  const factor = 10 ** digits;
  const rounded = Math.round(abs * factor) / factor;
  const sign = rounded === 0 ? "" : value < 0 ? "-" : "";
  try {
    return (
      sign +
      new Intl.NumberFormat(cfg.locale, {
        style: "currency",
        currency: isINR ? "INR" : code,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(rounded)
    );
  } catch {
    return `${sign}${Math.round(rounded).toLocaleString()}`;
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

const MONEY_IN_TEXT = /(?:₹|\bRs\.?|\bINR)\s*(-?)\s*(\d[\d,]*(?:\.\d+)?)/g;

/**
 * Backend prose carries INR amounts ("₹-303 monthly", "Rs 705/month"). Re-render each one in the selected currency with the
 * sign before the symbol. With `absolute`, a leading minus is dropped: a "monthly" saving or charge is never negative.
 */
export function localizeMoneyText(text: string, opts?: { absolute?: boolean; currency?: string }): string {
  const code = opts?.currency ?? readSavedCurrency() ?? "INR";
  const use = CURRENCY_RATES[code] ? code : "INR";
  return text.replace(MONEY_IN_TEXT, (_m, minus: string, num: string) => {
    const n = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(n)) return _m;
    return formatMoney(minus && !opts?.absolute ? -n : n, use);
  });
}
