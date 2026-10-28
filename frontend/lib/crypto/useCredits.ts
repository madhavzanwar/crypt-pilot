"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/crypto/api";
import type { CreditPack } from "@/lib/crypto/api";
import { CREDITS_CHANGED_EVENT } from "@/lib/crypto/creditsEvents";

export { CREDITS_CHANGED_EVENT, OPEN_CREDITS_EVENT, notifyCreditsChanged } from "@/lib/crypto/creditsEvents";

export interface CreditsState {
  /** null until the first answer, or when the crypto service is unreachable. */
  balance: number | null;
  packs: CreditPack[];
  loading: boolean;
  /** true when the last fetch failed (service down, no network). The UI shows "-" and never throws. */
  unavailable: boolean;
  refetch: () => Promise<void>;
}

export interface ActivityEntry {
  id: string;
  at: number;
  delta: number;
  balance: number;
}

const LAST_KEY = "cryptpilot:credits-last";
const LOG_KEY = "cryptpilot:credits-activity";
const MAX_LOG = 25;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be blocked: the log is a convenience only */
  }
}

/** The credits API has no ledger endpoint, so balance changes seen on this device are logged locally. */
function recordBalance(balance: number) {
  const last = readJson<number | null>(LAST_KEY, null);
  writeJson(LAST_KEY, balance);
  if (last === null || last === balance) return;
  const log = readJson<ActivityEntry[]>(LOG_KEY, []);
  log.unshift({ id: `${Date.now()}-${balance}`, at: Date.now(), delta: balance - last, balance });
  writeJson(LOG_KEY, log.slice(0, MAX_LOG));
}

/** Balance changes observed on this device (newest first). Not a bank-grade ledger. */
export function readCreditsActivity(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  return readJson<ActivityEntry[]>(LOG_KEY, []);
}

/**
 * Credits balance + packs from the crypto service. Refetches on mount, on the `cryptpilot:credits-changed` window event,
 * when the tab regains focus/visibility, and (slowly) on a timer. Never throws.
 */
export function useCredits(): CreditsState {
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await api.credits();
      if (!alive.current || mine !== seq.current) return;
      setBalance(res.balance);
      setPacks(res.packs);
      setUnavailable(false);
      recordBalance(res.balance);
    } catch {
      if (!alive.current || mine !== seq.current) return;
      setBalance(null);
      setUnavailable(true);
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const first = window.setTimeout(() => void refetch(), 0);
    const again = () => void refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, again);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      alive.current = false;
      window.clearTimeout(first);
      window.removeEventListener(CREDITS_CHANGED_EVENT, again);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refetch]);

  return { balance, packs, loading, unavailable, refetch };
}
