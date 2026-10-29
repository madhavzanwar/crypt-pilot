import { formatCurrency as baseFormat } from "@/lib/format";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";

/** Selected display currency (the same localStorage key CurrencyProvider writes). */
function activeConfig() {
  try {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("finpilot_currency") as CurrencyCode | null) : null;
    if (saved && CURRENCIES[saved]) return CURRENCIES[saved];
  } catch {}
  return CURRENCIES.INR;
}

/** True when a formatted amount shows zero ("-₹0", "-$0.00", "-0,00 €"). */
const isZeroText = (s: string) => !/[1-9]/.test(s);

/**
 * All money goes through here (BUG-023): honours the selected currency, never prints "-₹0" and always puts the
 * minus sign in front of the symbol ("-₹303", not "₹-303").
 */
export function formatCurrency(value: number, currencyCode?: string): string {
  let out = baseFormat(Number.isFinite(value) ? value : 0, currencyCode);
  if (isZeroText(out)) out = out.replace(/[-−]/g, "");
  return out.replace(/^(\D*?)[-−]/, (_m, sym: string) => `-${sym}`);
}

/** Compact axis label ("₹20k", "$1.2k", "₹1.5L" for INR) in the selected currency. */
export function formatCompact(inrValue: number): string {
  const cfg = activeConfig();
  const v = inrValue * cfg.rateFromINR;
  try {
    if (cfg.code === "INR") {
      const a = Math.abs(v);
      const s = a >= 100000 ? `${(a / 100000).toFixed(1).replace(/\.0$/, "")}L` : a >= 1000 ? `${Math.round(a / 1000)}k` : `${Math.round(a)}`;
      return `${v < 0 && a >= 0.5 ? "-" : ""}₹${s}`;
    }
    const out = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: cfg.code, notation: "compact", maximumFractionDigits: 1 }).format(v);
    return isZeroText(out) ? out.replace(/[-−]/g, "") : out;
  } catch {
    return `${cfg.symbol}${Math.round(v)}`;
  }
}
