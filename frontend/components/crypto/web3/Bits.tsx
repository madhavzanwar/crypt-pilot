"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Short form of a long hex string: 0x1234abcd...89ef01. The full value stays in the title attribute. */
export function shortHex(value: string, head = 10, tail = 8): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

type Tone = "info" | "warning" | "error" | "success" | "simulated";
const TONE: Record<Tone, string> = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  simulated: "border-dashed border-amber-400 bg-amber-50 text-amber-900",
};

/** Inline notice using FinPilot's semantic tints (same palette as ui/Chip). */
export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
        TONE[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {action}
    </div>
  );
}

/** Copy-to-clipboard icon button. Falls back silently when the clipboard API is unavailable. */
export function CopyIcon({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable: nothing to do */
        }
      }}
      className="inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-lg border border-mist bg-paper text-graphite transition-colors hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
    >
      {done ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

/** Label + monospace value (shortened, full value on hover) + copy. */
export function HashLine({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-graphite">
      <span>{label}</span>
      <span className={cn("font-mono text-ink", full && "break-all")} title={value} translate="no" lang="en">
        {full ? value : shortHex(value)}
      </span>
      <CopyIcon value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** Anchor that looks like a small secondary button; always opens in a new tab with noopener. */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-chip border border-mist bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-150 hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
    >
      {children}
    </a>
  );
}
