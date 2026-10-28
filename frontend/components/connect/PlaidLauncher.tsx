"use client";

import { useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { api } from "@/lib/api";

/** Mounted only once a link token exists: opens Plaid Link straight away, imports on success. */
export function PlaidLauncher({ token, userId, onClose }: { token: string; userId: string; onClose: () => void }) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      if (!publicToken) return;
      try {
        const r = await api.plaidImport(userId, publicToken);
        toast(`Plaid connected: ${r.accounts} accounts, ${r.transactions} transactions.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not import from Plaid");
      }
    },
    onExit: onClose,
  });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}
