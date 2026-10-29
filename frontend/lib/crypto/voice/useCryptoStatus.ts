"use client";

import { useEffect, useState } from "react";
import type { VoiceProvider } from "@/lib/crypto/api";
import { CRYPTO_API_BASE } from "@/lib/crypto/api";
import { VOICE_MODE } from "@/lib/crypto/env";

export interface CryptoStatus {
  /** The provider the service is configured to try first. "wispr" means a Wispr Flow key is set there, not that a given clip used it. */
  voiceProvider: VoiceProvider | null;
  /** Graph engine the service reports ("tigergraph", "networkx", "replay"...), or null when it does not say. */
  engine: string | null;
  /** The service is answering from demo / fixture data. */
  mocks: boolean;
}

const PROVIDERS: readonly string[] = ["wispr", "sarvam", "browser"];

async function fetchJson(path: string, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${CRYPTO_API_BASE}${path}`, { headers: { accept: "application/json" }, credentials: "include", signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/crypto/status (falls back to /api/crypto/health, which carries the same voiceProvider field).
 * Returns null while loading and when the service cannot be reached, so the caller simply hides the line.
 */
export function useCryptoStatus(): CryptoStatus | null {
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const body = (await fetchJson("/status", ctrl.signal)) ?? (await fetchJson("/health", ctrl.signal));
      if (ctrl.signal.aborted || !body) return;
      const vp = typeof body.voiceProvider === "string" && PROVIDERS.includes(body.voiceProvider) ? (body.voiceProvider as VoiceProvider) : null;
      setStatus({
        voiceProvider: VOICE_MODE === "browser" ? "browser" : vp,
        engine: typeof body.engine === "string" && body.engine !== "" && body.engineOk !== false ? body.engine : null,
        mocks: body.mocks === true,
      });
    })();
    return () => ctrl.abort();
  }, []);
  return status;
}
