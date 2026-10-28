"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { MAX_WALLETS } from "./types";

// Wallets to screen are kept in this browser (the councils' backend tables have no field for them and adding one is a
// schema change). Both councils share one list per profile. If storage is blocked the list lives in memory for the session.
const EVENT = "cryptpilot:council-wallets";
const memory = new Map<string, string>();
const keyFor = (userId: string) => `cryptpilot:council-wallets:${userId}`;

function read(userId: string): string {
  try {
    const v = window.localStorage.getItem(keyFor(userId));
    if (v !== null) return v;
  } catch {
    // storage blocked
  }
  return memory.get(keyFor(userId)) ?? "[]";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useWalletList(userId: string): [string[], (next: string[]) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(userId), () => "[]");
  const wallets = useMemo(() => {
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_WALLETS) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const set = useCallback(
    (next: string[]) => {
      const json = JSON.stringify(next.slice(0, MAX_WALLETS));
      memory.set(keyFor(userId), json);
      try {
        window.localStorage.setItem(keyFor(userId), json);
      } catch {
        // storage blocked: memory copy is used
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [userId],
  );
  return [wallets, set];
}
