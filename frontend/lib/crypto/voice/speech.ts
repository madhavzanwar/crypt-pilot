import type { Lang } from "@/lib/crypto/api";

/** Language tags for the Web Speech API. The crypto service speaks en/hi only; the browser also knows Marathi. */
export function speechLang(lang: Lang): "hi-IN" | "en-IN" {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

/** The slice of the Web Speech recognition API we use (TypeScript's DOM lib does not ship it). */
export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string };
}
export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Joins the final transcripts of a recognition event list. */
export function finalTranscript(results: SpeechRecognitionEventLike["results"]): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r && r.isFinal && r[0]) parts.push(r[0].transcript.trim());
  }
  return parts.join(" ").trim();
}
