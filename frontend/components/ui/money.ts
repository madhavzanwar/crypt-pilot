/**
 * The single place money is turned into text. Every amount in the UI goes through here so that:
 *  - the active currency (INR, USD, EUR, GBP, AED, SGD) is honoured everywhere, including chart axes,
 *  - the sign comes before the symbol ("-₹303", "+₹9,833", never "₹-303" or "+-₹9,833"),
 *  - a value that rounds to zero is shown as "₹0", never "-₹0",
 *  - lakh grouping (₹1,33,760) is used for INR and nothing is split by a space ("₹133, 760").
 * Pure module (no React, no alias imports) so it can be unit-tested with plain node.
 * Amounts are stored in INR; `rateFromINR` converts for display. Keep the table in step with lib/currency.tsx.
 */
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD";

export interface MoneyConfig {
  code: CurrencyCode;
  symbol: string;
  rateFromINR: number; // 1 INR in this currency
  locale: string;
}

export const MONEY_CURRENCIES: Record<CurrencyCode, MoneyConfig> = {
  INR: { code: "INR", symbol: "₹", rateFromINR: 1, locale: "en-IN" },
  USD: { code: "USD", symbol: "$", rateFromINR: 0.0116, locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", rateFromINR: 0.0107, locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", rateFromINR: 0.009, locale: "en-GB" },
  AED: { code: "AED", symbol: "AED", rateFromINR: 0.0425, locale: "en-AE" }, // Latin digits, not ar-AE's Arabic-Indic
  SGD: { code: "SGD", symbol: "S$", rateFromINR: 0.0153, locale: "en-SG" },
};

export const CURRENCY_STORAGE_KEY = "finpilot_currency";

export interface MoneyOptions {
  /** Always two decimals. */
  cents?: boolean;
  /** "always" prefixes "+" on positive values (the "-" on negatives is always shown). */
  sign?: "auto" | "always";
  /** Treat the number as already being in the target currency (no INR conversion). */
  inCurrency?: boolean;
}

/** The currency the user picked (localStorage), INR on the server or when nothing valid is stored. */
export function activeCurrency(): MoneyConfig {
  try {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyCode | null;
      if (saved && MONEY_CURRENCIES[saved]) return MONEY_CURRENCIES[saved];
    }
  } catch {
    // blocked storage: INR
  }
  return MONEY_CURRENCIES.INR;
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

function digitsFor(cfg: MoneyConfig, abs: number, cents?: boolean): number {
  if (cents) return 2;
  return cfg.code === "INR" || abs >= 100 ? 0 : 2;
}

function body(abs: number, cfg: MoneyConfig, digits: number): string {
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(abs);
  } catch {
    return `${cfg.symbol}${abs.toFixed(digits)}`;
  }
}

/** "₹4,05,000", "-₹303", "+₹9,833", "$1,234". Sign first, symbol next, no negative zero. */
export function formatMoney(amountInINR: number, cfg: MoneyConfig = MONEY_CURRENCIES.INR, opts: MoneyOptions = {}): string {
  const value = finite(amountInINR) * (opts.inCurrency ? 1 : cfg.rateFromINR);
  const abs = Math.abs(value);
  const digits = digitsFor(cfg, abs, opts.cents);
  const factor = 10 ** digits;
  const rounded = Math.round(abs * factor) / factor;
  const sign = rounded === 0 ? "" : value < 0 ? "-" : opts.sign === "always" ? "+" : "";
  return sign + body(rounded, cfg, digits);
}

/** Compact amount for chart axes and tiny labels in the active currency: "₹0", "₹20K", "₹1.5L" style per locale. */
export function formatAxisMoney(amountInINR: number, cfg: MoneyConfig = MONEY_CURRENCIES.INR): string {
  const value = finite(amountInINR) * cfg.rateFromINR;
  const abs = Math.abs(value);
  if (Math.round(abs) === 0) return body(0, cfg, 0);
  let text: string;
  try {
    text = new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(abs);
  } catch {
    text = `${cfg.symbol}${Math.round(abs)}`;
  }
  return (value < 0 ? "-" : "") + text;
}

/** Same as `formatMoney` but for the currency the user has chosen. Drop-in for the old `formatCurrency` in lib/format. */
export function formatCurrency(value: number, currencyCode?: string): string {
  if (currencyCode && currencyCode in MONEY_CURRENCIES) {
    return formatMoney(value, MONEY_CURRENCIES[currencyCode as CurrencyCode], { inCurrency: true });
  }
  return formatMoney(value, activeCurrency());
}

/** Signed amount for gains and changes: "+₹9,833" / "-₹8,831" / "₹0". */
export function formatSignedCurrency(value: number): string {
  return formatMoney(value, activeCurrency(), { sign: "always" });
}

// ImpactEstimate.metric is free text from the backend; metrics that name a score/rate/count are plain numbers.
const PLAIN_NUMBER_METRIC = /\b(score|rate|percent|months?|days?)\b/i;

/** Impact figure with an explicit sign: "+₹9,833" for money, "+3" / "-1.5" for scores and counts. */
export function formatSignedImpact(metric: string, value: number): string {
  if (PLAIN_NUMBER_METRIC.test(metric) || Math.abs(value) < 50) {
    const text = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return value > 0 ? `+${text}` : text;
  }
  return formatSignedCurrency(value);
}

/** Axis label in the active currency. */
export function formatAxisCurrency(value: number): string {
  return formatAxisMoney(value, activeCurrency());
}

/** Currency symbol of the active currency (for input prefixes and labels such as "Amount (₹)"). */
export function currencySymbol(): string {
  return activeCurrency().symbol;
}

/** Matches a rendered amount: a symbol/code next to digits, in either order. Used to mask amounts in privacy mode. */
export const AMOUNT_PATTERN =
  /(?:[₹$€£]|S\$|\bAED|\bINR|\bUSD|\bEUR|\bGBP|\bSGD|\bRs\.?)\s?[-+−]?\s?\d|\d[\d,.]*\s?(?:[₹$€£]|AED|INR|USD|EUR|GBP|SGD)(?![A-Za-z])/;

export const hasAmount = (text: string): boolean => AMOUNT_PATTERN.test(text);

export function formatImpactValue(metric: string, value: number): string {
  if (PLAIN_NUMBER_METRIC.test(metric) || Math.abs(value) < 50) {
    return Number.isInteger(value) ? value.toString() : value.toFixed(1);
  }
  return formatCurrency(value);
}

/** An INR amount as the number to show in an input while the active currency is `cfg` (2 decimals, trimmed). */
export function toDisplayAmount(amountInINR: number, cfg: MoneyConfig = activeCurrency()): number {
  const v = finite(amountInINR) * cfg.rateFromINR;
  return Math.round(v * 100) / 100;
}

/** What the person typed in the active currency, back to INR (the unit every model and API call uses). */
export function fromDisplayAmount(typed: number, cfg: MoneyConfig = activeCurrency()): number {
  return finite(typed) / cfg.rateFromINR;
}
