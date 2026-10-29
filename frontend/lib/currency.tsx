"use client";

import React, { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { formatMoney, readSavedCurrency } from "./format";

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  label: string;
  flag: string;
  rateFromINR: number; // 1 INR in this currency
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: {
    code: "INR",
    symbol: "₹",
    label: "Indian Rupee",
    flag: "🇮🇳",
    rateFromINR: 1,
    locale: "en-IN",
  },
  USD: {
    code: "USD",
    symbol: "$",
    label: "US Dollar",
    flag: "🇺🇸",
    rateFromINR: 0.0116, // $1 ≈ ₹86.20
    locale: "en-US",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    label: "Euro",
    flag: "🇪🇺",
    rateFromINR: 0.0107, // €1 ≈ ₹93.45
    locale: "de-DE",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    label: "British Pound",
    flag: "🇬🇧",
    rateFromINR: 0.0090, // £1 ≈ ₹111.10
    locale: "en-GB",
  },
  AED: {
    code: "AED",
    symbol: "د.إ",
    label: "UAE Dirham",
    flag: "🇦🇪",
    rateFromINR: 0.0425, // 1 AED ≈ ₹23.53
    locale: "ar-AE",
  },
  SGD: {
    code: "SGD",
    symbol: "S$",
    label: "Singapore Dollar",
    flag: "🇸🇬",
    rateFromINR: 0.0153, // 1 SGD ≈ ₹65.35
    locale: "en-SG",
  },
};

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  config: CurrencyConfig;
  formatAmount: (amountInINR: number, options?: { showCents?: boolean }) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "INR",
  setCurrency: () => {},
  config: CURRENCIES.INR,
  formatAmount: (amountInINR: number, options?: { showCents?: boolean }) =>
    formatMoney(amountInINR, "INR", options),
});

const STORAGE_KEY = "finpilot_currency";

const CHANGE_EVENT = "finpilot:currency-change";

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): CurrencyCode {
  const saved = readSavedCurrency() as CurrencyCode | null;
  return saved && CURRENCIES[saved] ? saved : "INR";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Server and first client render use INR, then the saved choice is applied
  // (no hydration mismatch). Storage access is guarded so blocked storage
  // cannot blank the app (BUG-031).
  const currency = useSyncExternalStore(subscribe, getSnapshot, () => "INR" as CurrencyCode);

  const setCurrency = useCallback((next: CurrencyCode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked: choice lasts only until reload */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }, []);

  const config = CURRENCIES[currency] || CURRENCIES.INR;

  const formatAmount = (amountInINR: number, options?: { showCents?: boolean }): string =>
    formatMoney(amountInINR, config.code, options);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, config, formatAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
