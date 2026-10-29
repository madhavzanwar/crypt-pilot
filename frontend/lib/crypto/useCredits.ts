"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/crypto/api";
import type { CreditPack } from "@/lib/crypto/api";
import { CREDITS_CHANGED_EVENT } from "@/lib/crypto/creditsEvents";
import { DEFAULT_USER_ID, getUserId, USER_ID_CHANGE_EVENT } from "@/lib/user";

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

/** The activity log and its baseline are kept per signed-in / demo user, so a persona switch never logs a fake entry (BUG-072). */
const lastKeyFor = (uid: string) => `${LAST_KEY}:${uid}`;
const logKeyFor = (uid: string) => `${LOG_KEY}:${uid}`;
const currentUser = () => (typeof window === "undefined" ? DEFAULT_USER_ID : getUserId());

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
function recordBalance(uid: string, balance: number) {
  const last = readJson<number | null>(lastKeyFor(uid), null);
  writeJson(lastKeyFor(uid), balance);
  if (last === null || last === balance) return;
  const log = readJson<ActivityEntry[]>(logKeyFor(uid), []);
  log.unshift({ id: `${Date.now()}-${balance}`, at: Date.now(), delta: balance - last, balance });
  writeJson(logKeyFor(uid), log.slice(0, MAX_LOG));
}

/** Balance changes observed on this device for the current user (newest first). Not a bank-grade ledger. */
export function readCreditsActivity(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  return readJson<ActivityEntry[]>(logKeyFor(currentUser()), []);
}

// ---------------------------------------------------------------- one shared store (one poller for every hook instance)

const INITIAL: Omit<CreditsState, "refetch"> = { balance: null, packs: [], loading: true, unavailable: false };
let snapshot: Omit<CreditsState, "refetch"> = INITIAL;
const listeners = new Set<() => void>();
let seq = 0;
let teardown: (() => void) | null = null;

function publish(next: Omit<CreditsState, "refetch">) {
  snapshot = next;
  listeners.forEach((l) => l());
}

async function refetchShared(): Promise<void> {
  const mine = ++seq;
  const uid = currentUser();
  try {
    const res = await api.credits();
    if (mine !== seq) return;
    recordBalance(uid, res.balance);
    publish({ balance: res.balance, packs: res.packs, loading: false, unavailable: false });
  } catch {
    if (mine !== seq) return;
    publish({ ...snapshot, balance: null, loading: false, unavailable: true });
  }
}

function start() {
  const again = () => void refetchShared();
  const onVisible = () => {
    if (document.visibilityState === "visible") again();
  };
  const first = window.setTimeout(again, 0);
  window.addEventListener(CREDITS_CHANGED_EVENT, again);
  window.addEventListener(USER_ID_CHANGE_EVENT, again);
  window.addEventListener("focus", again);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(onVisible, 60_000);
  teardown = () => {
    window.clearTimeout(first);
    window.removeEventListener(CREDITS_CHANGED_EVENT, again);
    window.removeEventListener(USER_ID_CHANGE_EVENT, again);
    window.removeEventListener("focus", again);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown?.();
      teardown = null;
      seq += 1; // an answer still on its way is dropped
    }
  };
}

/**
 * Credits balance + packs from the crypto service. All hook instances share one store and one poller. It refetches on mount,
 * on the `cryptpilot:credits-changed` window event, on a user switch, when the tab regains focus/visibility, and (slowly) on a
 * timer. Never throws.
 */
export function useCredits(): CreditsState {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL);
  const refetch = useCallback(() => refetchShared(), []);
  useEffect(() => {
    // a hook that mounts after the first answer still shows it at once; refresh quietly when the data is already old news
    if (!snapshot.loading) void refetchShared();
  }, []);
  return { ...state, refetch };
}
