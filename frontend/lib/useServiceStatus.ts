"use client";

import { useEffect, useState } from "react";

/** The fields of GET /api/crypto/status that decide which provider names the UI may show. */
export interface ServiceStatus {
  engine: string | null;
  voiceProvider: string | null;
}

/** A provider is named only when the service reports that it is the one in use. */
export function voiceProviderLabel(status: ServiceStatus | null): string {
  if (status?.voiceProvider === "wispr") return "Wispr Flow";
  if (status?.voiceProvider === "sarvam") return "Sarvam";
  return "voice";
}

/** null while loading or when the service is unreachable: callers fall back to the neutral labels. */
export function useServiceStatus(): ServiceStatus | null {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/crypto/status", { headers: { accept: "application/json" }, signal: ctrl.signal });
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (!body || typeof body !== "object" || ctrl.signal.aborted) return;
        const b = body as Record<string, unknown>;
        setStatus({
          engine: typeof b.engine === "string" ? b.engine : null,
          voiceProvider: typeof b.voiceProvider === "string" ? b.voiceProvider : null,
        });
      } catch {
        /* unreachable service: keep neutral labels */
      }
    })();
    return () => ctrl.abort();
  }, []);
  return status;
}
