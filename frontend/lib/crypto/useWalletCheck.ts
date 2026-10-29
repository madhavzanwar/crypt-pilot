"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  apiOptions,
  isApiError,
  messageFor,
  streamCheck,
  type CheckResponse,
  type ErrorAction,
  type Lang,
  type StepEvent,
} from "@/lib/crypto/api";
import { notifyCreditsChanged } from "@/lib/crypto/creditsEvents";

export const STEP_IDS = ["validate", "graph", "hops", "score", "explain"] as const;
export type StepId = (typeof STEP_IDS)[number];

/** A check that takes longer than this ends with a friendly "try again" (the shared request is aborted too). */
export const CHECK_TIMEOUT_MS = 25_000;
/** The backend serves repeats of the same address from its cache (free) for this long. */
export const RECENT_MS = 10 * 60 * 1000;

export type WalletCheckState =
  | { phase: "idle" }
  | { phase: "checking"; address: string; steps: StepEvent[] }
  | { phase: "done"; result: CheckResponse; lang: Lang; reused: boolean }
  | {
      phase: "error";
      address: string;
      code: string;
      status: number;
      message: string;
      action: ErrorAction;
      body?: CheckResponse;
    };

export interface RunOptions {
  /** Show a result from the last 10 minutes without calling the API again (used by the inline chat card). */
  reuse?: boolean;
}

/** Index (0-based) of the step currently running, or -1 before the first step. */
export function activeStepIndex(steps: StepEvent[]): number {
  let idx = -1;
  for (const s of steps) idx = Math.max(idx, STEP_IDS.indexOf(s.id as StepId));
  return idx;
}

// ---------------------------------------------------------------- shared in-flight + recent results
// Module level on purpose: React StrictMode mounts effects twice and the chat can re-render a card, but one
// address must cost one credit. Subscribers can detach (cancel / unmount); the request itself keeps going and
// the backend then answers the next identical request from its free cache.

interface Flight {
  promise: Promise<CheckResponse>;
  steps: StepEvent[];
  listeners: Set<(s: StepEvent) => void>;
}

const flights = new Map<string, Flight>();
const recent = new Map<string, { at: number; result: CheckResponse }>();
/**
 * Cache / in-flight key: the address only. The UI language must not be part of it, or switching language while a card
 * is visible would start a second paid check. Base58 addresses are case-sensitive, so only bech32 (bc1...) is lower-cased.
 */
export const keyOf = (address: string): string => {
  const a = address.trim();
  return /^bc1/i.test(a) ? a.toLowerCase() : a;
};

const canFallBackToPlain = (e: unknown, sawStep: boolean): boolean =>
  isApiError(e) &&
  !sawStep &&
  (e.status === 404 || e.status === 405 || e.status === 501 || e.code === "invalid_response" || e.code === "stream_ended");

export function announceCredits(res: CheckResponse): void {
  if (typeof window === "undefined" || res.creditsRemaining === undefined) return;
  // The pill, the drawer and /credits all listen for CREDITS_CHANGED_EVENT (the one shared name) and refetch.
  notifyCreditsChanged();
}

function startFlight(address: string, lang: Lang): Flight {
  const key = keyOf(address);
  const existing = flights.get(key);
  if (existing) return existing;

  const ctrl = new AbortController();
  const flight: Flight = { promise: Promise.resolve(null as unknown as CheckResponse), steps: [], listeners: new Set() };
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  const onStep = (s: StepEvent) => {
    flight.steps = [...flight.steps.filter((x) => x.id !== s.id), s];
    flight.listeners.forEach((l) => l(s));
  };

  flight.promise = (async () => {
    let sawStep = false;
    try {
      let res: CheckResponse;
      try {
        res = await streamCheck(
          apiOptions,
          address,
          lang,
          {
            onStep: (s) => {
              sawStep = true;
              onStep(s);
            },
          },
          ctrl.signal,
        );
      } catch (e) {
        if (!canFallBackToPlain(e, sawStep)) throw e;
        // The stream is unavailable (proxy buffering, old backend): the plain endpoint still works.
        const labels = STEP_IDS.map((id) => ({ id, label: id }));
        let i = 0;
        onStep(labels[0]);
        const tick = setInterval(() => {
          i += 1;
          if (labels[i] && i < labels.length - 1) onStep(labels[i]);
        }, 350);
        try {
          res = await api.check(address, lang, { signal: ctrl.signal });
        } finally {
          clearInterval(tick);
        }
      }
      recent.set(key, { at: Date.now(), result: res });
      if (res.cached !== true) announceCredits(res);
      return res;
    } finally {
      clearTimeout(timer);
      flights.delete(key);
    }
  })();
  flights.set(key, flight);
  return flight;
}

/** A result from the last 10 minutes, if there is one. */
export function findRecent(address: string, now = Date.now()): CheckResponse | undefined {
  const hit = recent.get(keyOf(address));
  return hit && now - hit.at < RECENT_MS ? hit.result : undefined;
}

function toErrorState(e: unknown, lang: Lang, address: string, timedOut: boolean): WalletCheckState {
  if (timedOut || (isApiError(e) && e.code === "aborted")) {
    return {
      phase: "error",
      address,
      code: "timeout",
      status: 0,
      action: "retry-later",
      message:
        lang === "hi"
          ? "इसमें बहुत समय लग रहा है। कृपया फिर से कोशिश करें।"
          : "This is taking too long. Please try again.",
    };
  }
  const m = messageFor(e, lang);
  return {
    phase: "error",
    address,
    code: isApiError(e) ? e.code : "unknown",
    status: isApiError(e) ? e.status : 0,
    message: m.message,
    action: m.action,
    body: isApiError(e) ? e.body : undefined,
  };
}

/**
 * Runs wallet checks: SSE (`streamCheck`) with progress steps, falling back to the plain POST when the stream is
 * unavailable. `state` is a small state machine (idle -> checking -> done | error). The address is never logged.
 */
export function useWalletCheck(): {
  state: WalletCheckState;
  /** Resolves with the final state (done | error), or null when a newer run / unmount took over. */
  run: (address: string, lang: Lang, opts?: RunOptions) => Promise<WalletCheckState | null>;
  reset: () => void;
} {
  const [state, setState] = useState<WalletCheckState>({ phase: "idle" });
  const token = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; // a late answer must not set state on an unmounted component (live() checks this flag)
    };
  }, []);

  const run = useCallback(async (address: string, lang: Lang, opts?: RunOptions): Promise<WalletCheckState | null> => {
    const mine = ++token.current;
    const live = () => mounted.current && token.current === mine;

    if (opts?.reuse) {
      const hit = findRecent(address);
      if (hit) {
        const done: WalletCheckState = { phase: "done", result: hit, lang, reused: true };
        setState(done);
        return done;
      }
    }

    const flight = startFlight(address, lang);
    setState({ phase: "checking", address, steps: flight.steps });
    const onStep = () => {
      if (live()) setState({ phase: "checking", address, steps: flight.steps });
    };
    flight.listeners.add(onStep);
    try {
      const result = await flight.promise;
      const done: WalletCheckState = { phase: "done", result, lang, reused: false };
      if (!live()) return null;
      setState(done);
      return done;
    } catch (e) {
      if (!live()) return null;
      const failed = toErrorState(e, lang, address, e instanceof ApiError && e.code === "aborted");
      setState(failed);
      return failed;
    } finally {
      flight.listeners.delete(onStep);
    }
  }, []);

  /** Back to idle; an answer that is still on its way is ignored. */
  const reset = useCallback(() => {
    token.current += 1;
    setState({ phase: "idle" });
  }, []);

  return { state, run, reset };
}
