"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";

/** Payment rails (Dodo, Cake Wallet) are always "connected" but carry no data, so they never count as a linked data source. */
export const PAYMENT_RAIL_IDS = ["dodo", "cake_wallet"] as const;
export const isPaymentRail = (id: string): boolean => (PAYMENT_RAIL_IDS as readonly string[]).includes(id);

/** Connector list for the active user; refetches automatically after any write. */
export function useConnectors() {
  const userId = useUserId();
  const fetchConnectors = useCallback(() => api.connectors(userId), [userId]);
  const state = useAsync(fetchConnectors, [userId]);
  const connectedCount = state.data?.filter((c) => c.connected && !isPaymentRail(c.id)).length ?? 0;
  return { ...state, userId, connectedCount, hasConnection: connectedCount > 0 };
}
