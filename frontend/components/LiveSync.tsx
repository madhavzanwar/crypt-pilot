"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api, clearApiCache } from "@/lib/api";
import { DATA_CHANGED_EVENT, useUserId } from "@/lib/hooks";
import { formatCurrency } from "@/components/ui/money";

/** Polls a cheap server change counter and refreshes every mounted page when data was written elsewhere
 * (e.g. a payment made in the phone demo app), so the dashboard updates without a reload. */
export function LiveSync() {
  const userId = useUserId();
  const last = useRef<number | null>(null);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const { version } = await api.payLive(userId);
        if (last.current !== null && version !== last.current) {
          clearApiCache();
          window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
          const top = (await api.payReviews(userId, 1).catch(() => []))[0];
          if (top && seen.current !== null && top.id !== seen.current) {
            if (top.status === "blocked") toast.error(`Payment of ${formatCurrency(top.amount)} to ${top.payee_name} was blocked: ${top.review.headline}`);
          }
          if (top) seen.current = top.id;
        }
        if (last.current === null) seen.current = (await api.payReviews(userId, 1).catch(() => []))[0]?.id ?? "";
        last.current = version;
      } catch {
        // offline or signed out: try again next tick
      }
    };
    const id = setInterval(tick, 3000);
    void tick();
    return () => clearInterval(id);
  }, [userId]);

  return null;
}
