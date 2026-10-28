"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { subscribeCopilotInsights } from "@/lib/copilotBus";
import { useUserId } from "@/lib/hooks";
import type { CopilotInsight } from "@/lib/types";

const POLL_MS = 20_000;
const MAX_VISIBLE = 3;
const ACCENT: Record<CopilotInsight["severity"], string> = {
  critical: "border-l-rose-500",
  warning: "border-l-amber-500",
  positive: "border-l-emerald-500",
  info: "border-l-indigo-500",
};

function Toast({ insight, onClose }: { insight: CopilotInsight; onClose: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const ms = insight.severity === "critical" || insight.severity === "warning" ? 20_000 : 10_000;
  // Pausing clears the timer; resuming restarts the full countdown.
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onClose(insight.id), ms);
    return () => clearTimeout(t);
  }, [paused, ms, insight.id, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto rounded-2xl border border-mist border-l-4 ${ACCENT[insight.severity]} bg-paper p-3.5 shadow-lg`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-graphite">
          <Sparkles className="h-3 w-3" aria-hidden /> Copilot
        </span>
        <button type="button" aria-label="Dismiss" onClick={() => onClose(insight.id)} className="text-graphite hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm font-semibold">{insight.title}</p>
      <p className="mt-0.5 text-sm text-graphite">{insight.body}</p>
      {insight.action && (
        <Link
          href={insight.action.href}
          onClick={() => onClose(insight.id)}
          className="mt-2 inline-block rounded-full border border-mist px-3 py-1 text-xs font-semibold hover:bg-fog"
        >
          {insight.action.label}
        </Link>
      )}
    </motion.div>
  );
}

export function CopilotToaster() {
  const userId = useUserId();
  const [toasts, setToasts] = useState<CopilotInsight[]>([]);
  const seen = useRef(new Set<string>());
  const lastSeen = useRef("");
  const key = `copilot:lastSeen:${userId}`;

  const add = useCallback(
    (list: CopilotInsight[]) => {
      const fresh = list.filter((i) => !seen.current.has(i.id));
      if (!fresh.length) return;
      fresh.forEach((i) => {
        seen.current.add(i.id);
        if (i.created_at > lastSeen.current) lastSeen.current = i.created_at;
      });
      try {
        localStorage.setItem(key, lastSeen.current);
      } catch {}
      // newest first; oldest beyond the cap are dropped
      setToasts((prev) =>
        [...fresh.sort((a, b) => b.created_at.localeCompare(a.created_at)), ...prev].slice(0, MAX_VISIBLE),
      );
    },
    [key],
  );
  const close = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  useEffect(() => {
    if (!userId) return;
    seen.current = new Set();
    let stored = "";
    try {
      stored = localStorage.getItem(key) ?? "";
    } catch {}
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    lastSeen.current = stored > twoMinAgo ? stored : twoMinAgo;

    const poll = async () => {
      if (document.hidden) return;
      try {
        add(await api.copilotInsights(userId, lastSeen.current));
      } catch {
        // route missing / offline: stay silent
      }
    };
    poll();
    const iv = setInterval(poll, POLL_MS);
    const unsub = subscribeCopilotInsights(add);
    return () => {
      clearInterval(iv);
      unsub();
    };
  }, [userId, key, add]);

  if (!userId) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-[90] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96 lg:bottom-6 lg:right-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} insight={t} onClose={close} />
        ))}
      </AnimatePresence>
    </div>
  );
}
