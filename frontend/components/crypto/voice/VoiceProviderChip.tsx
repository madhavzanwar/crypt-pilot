"use client";

import { AudioLines } from "lucide-react";
import type { VoiceProvider } from "@/lib/crypto/api";
import { useVoiceT, type VoiceStringKey } from "@/lib/crypto/voice/strings";
import { cn } from "@/lib/utils";

const KEYS: Record<VoiceProvider, VoiceStringKey> = {
  wispr: "cp.voice.wispr",
  sarvam: "cp.voice.sarvam",
  browser: "cp.voice.browser",
};

/**
 * "Voice: Wispr Flow | Sarvam | Browser speech". The name comes straight from the provider the service
 * reported for that transcript. Anything that is not exactly "wispr" or "sarvam" is shown as browser speech.
 */
export function VoiceProviderChip({ provider, className }: { provider: VoiceProvider; className?: string }) {
  const { tr } = useVoiceT();
  const shown: VoiceProvider = provider === "wispr" || provider === "sarvam" ? provider : "browser";
  return (
    <span
      data-provider={shown}
      className={cn("inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-fog px-2 py-0.5 text-[11px] font-medium text-graphite", className)}
    >
      <AudioLines className="size-3 text-olive" aria-hidden />
      {tr("cp.voice.label")}: {tr(KEYS[shown])}
    </span>
  );
}

export default VoiceProviderChip;
