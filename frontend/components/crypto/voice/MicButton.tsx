"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { Loader2, Mic, MicOff, X } from "lucide-react";
import type { Lang, VoiceProvider } from "@/lib/crypto/api";
import { TAP_MS, formatTimer } from "@/lib/crypto/voice/record";
import { useVoiceT, type VoiceStringKey } from "@/lib/crypto/voice/strings";
import { useVoiceInput, type VoiceErrorKind } from "@/lib/crypto/voice/useVoiceInput";
import { cn } from "@/lib/utils";
import { Waveform } from "./Waveform";

const ERROR_KEYS: Record<VoiceErrorKind, VoiceStringKey> = {
  denied: "cp.mic.err.denied",
  no_mic: "cp.mic.err.noMic",
  empty: "cp.mic.err.empty",
  failed: "cp.mic.err.failed",
  unavailable: "cp.mic.err.unavailable",
};

export interface MicButtonProps {
  /** Service language: the crypto service speaks en/hi, so pass "hi" for Hindi and Marathi. */
  lang: Lang;
  /** The text is meant to be dropped into the input for the person to edit. Never send it automatically. */
  onTranscript: (text: string, provider: VoiceProvider) => void;
  disabled?: boolean;
  /** Language tag for the browser-speech fallback (e.g. "mr-IN"); defaults to en-IN / hi-IN from `lang`. */
  speechTag?: string;
  /** Called when the audio or transcript looks like a seed phrase or private key; nothing is passed on. */
  onSecret?: () => void;
  className?: string;
}

/**
 * Mic for the Copilot input. Tap to start and tap to stop, or hold to talk and release to stop (Esc cancels).
 * Records with MediaRecorder and sends it to the crypto service; when the service is unavailable it
 * switches to the browser's Web Speech API. A recording is capped at 29 s (the service limit is 30 s).
 */
export default function MicButton({ lang, onTranscript, disabled = false, speechTag, onSecret, className }: MicButtonProps) {
  const { tr } = useVoiceT();
  const reduce = useReducedMotion() ?? false;
  const voice = useVoiceInput({
    lang,
    speechTag,
    onResult: (r) => onTranscript(r.text, r.provider),
    onSecret,
  });

  const live = useRef(voice);
  useEffect(() => {
    live.current = voice; // handlers read the latest voice state from the ref
  });
  const downAt = useRef(0);
  const stickyRef = useRef(false);
  const setSticky = (v: boolean) => {
    stickyRef.current = v;
  };

  const { status } = voice;
  const unsupported = status === "unsupported";
  const off = disabled || unsupported;
  const recording = status === "recording";
  const busy = status === "requesting" || status === "transcribing";

  // Esc cancels while recording.
  useEffect(() => {
    if (!recording && status !== "requesting") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      stickyRef.current = false;
      downAt.current = 0;
      live.current.cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recording, status]);

  const press = () => {
    const v = live.current;
    if (v.status === "recording" || v.status === "requesting") {
      if (stickyRef.current) {
        setSticky(false);
        downAt.current = 0;
        v.stop();
      }
      return;
    }
    if (v.status === "transcribing" || v.status === "unsupported") return;
    if (v.status === "error") v.reset();
    downAt.current = Date.now();
    setSticky(false);
    v.start();
  };
  const release = () => {
    if (downAt.current === 0) return;
    const held = Date.now() - downAt.current;
    downAt.current = 0;
    if (held < TAP_MS) setSticky(true); // a tap: keep recording until the next tap
    else live.current.stop();
  };

  const label = unsupported
    ? tr("cp.mic.unsupported")
    : recording
      ? tr("cp.mic.stop")
      : status === "transcribing"
        ? tr("cp.mic.transcribing")
        : status === "requesting"
          ? tr("cp.mic.requesting")
          : tr("cp.mic.start");

  const errorText =
    status === "error" && voice.error
      ? voice.error.kind === "unavailable" && !voice.error.browserNext
        ? tr("cp.mic.err.unavailableNoBrowser")
        : tr(ERROR_KEYS[voice.error.kind])
      : null;

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      {recording && (
        <button
          type="button"
          onClick={() => {
            stickyRef.current = false;
            downAt.current = 0;
            live.current.cancel();
          }}
          aria-label={tr("cp.mic.cancel")}
          title={tr("cp.mic.cancel")}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full text-pewter transition-colors hover:bg-fog hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        data-mic
        disabled={off}
        aria-label={label}
        aria-pressed={recording}
        title={label}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={(e) => {
          if (e.detail !== 0) return; // pointer clicks are handled above; this is keyboard Enter or Space
          if (live.current.status === "recording") {
            setSticky(false);
            live.current.stop();
          } else {
            setSticky(true);
            live.current.start();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "flex h-8 touch-none select-none items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          recording ? "gap-2 bg-ink px-3 text-lime" : "w-8 bg-fog text-graphite hover:bg-sage hover:text-ink",
          status === "error" && "text-rose-600",
          !off && "cursor-pointer",
        )}
      >
        {recording ? (
          <>
            <Waveform analyser={voice.analyser} reduceMotion={reduce} />
            <span className="text-[11px] font-medium tabular-nums">{formatTimer(voice.elapsed)}</span>
          </>
        ) : busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : status === "error" || unsupported ? (
          <MicOff className="size-4" aria-hidden />
        ) : (
          <Mic className="size-4" aria-hidden />
        )}
      </button>

      {/* spoken status for screen readers, and the reason when something went wrong */}
      <span className="sr-only" role="status" aria-live="polite">
        {recording ? tr("cp.mic.recording") : busy ? label : ""}
      </span>
      {errorText && (
        <div
          role="alert"
          className="absolute bottom-full right-0 z-10 mb-2 w-64 rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-white shadow-lg"
        >
          {errorText}
        </div>
      )}
    </div>
  );
}
