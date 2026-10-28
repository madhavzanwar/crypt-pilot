"use client";
// STUB (owner: voice agent overwrites this file). Contract: hold/click to record, returns text and which provider produced it.
import type { Lang, VoiceProvider } from "@/lib/crypto/api";

export default function MicButton(_props: {
  lang: Lang;
  onTranscript: (text: string, provider: VoiceProvider) => void;
  disabled?: boolean;
}) {
  return null;
}
