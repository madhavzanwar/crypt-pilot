"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const OVERRIDE = "finpilot_simple"; // "1" | "0" | absent = decide from the questionnaire
const NOW = "finpilot_simple_now"; // what is actually in effect (read via getSimpleNow in i18n.ts)
const listeners = new Set<() => void>();

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Simple view = very few big numbers and a talking assistant. On for anyone who said they are not fully comfortable reading. */
export function useSimpleMode(userId: string): [boolean, (on: boolean) => void] {
  const profile = useAsync(useCallback(() => api.profile(userId), [userId]), [userId]);
  const override = useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), () => read(OVERRIDE), () => null);
  const comfort = profile.data?.answers.comfort;
  const vendor = profile.data?.answers.role === "Small vendor (shop, cart, stall)"; // a stall owner gets the minimal view even if they said they can read
  const simple = override ? override === "1" : vendor || (!!comfort && comfort !== "I am comfortable");
  useEffect(() => {
    try {
      localStorage.setItem(NOW, simple ? "1" : "0");
    } catch {}
  }, [simple]);
  const set = useCallback((on: boolean) => {
    try {
      localStorage.setItem(OVERRIDE, on ? "1" : "0");
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return [simple, set];
}

const ANALYST = "finpilot_analyst"; // "1" | "0" | absent = decide from the questionnaire role

/** Analyst view = the standard dashboard plus a dense numbers-first block. On for finance professionals; anyone can switch it. */
export function useAnalystMode(userId: string): [boolean, (on: boolean) => void] {
  const profile = useAsync(useCallback(() => api.profile(userId), [userId]), [userId]);
  const override = useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), () => read(ANALYST), () => null);
  const analyst = override ? override === "1" : profile.data?.answers.role === "Finance professional / analyst";
  const set = useCallback((on: boolean) => {
    try {
      localStorage.setItem(ANALYST, on ? "1" : "0");
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return [analyst, set];
}
