"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CRYPTO_API_BASE, buildUrl, type CheckResponse, type Lang } from "@/lib/crypto/api";
import { SPEECH_LANG } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useGuardT } from "./copy";

type ListenState = "idle" | "playing" | "paused";
const noopSubscribe = () => () => undefined;
const INSUFFICIENT = /insufficient evidence|पर्याप्त सबूत नहीं/i;

const synthOk = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Plays the backend MP3 (`/api/crypto/audio/...`) when it matches the tab's language, else the browser's speech synthesis. */
function useListen(result: CheckResponse, tab: Lang, requestLang: Lang) {
  const [state, setState] = useState<ListenState>("idle");
  const [progress, setProgress] = useState(0);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const useAudio = Boolean(result.audioUrl) && tab === requestLang;
  const supported = mounted && (useAudio || synthOk());

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (synthOk()) window.speechSynthesis.cancel();
    setState("idle");
    setProgress(0);
  }, []);

  // Changing tab or leaving the page stops playback.
  useEffect(() => stop, [tab, stop]);

  const toggle = useCallback(() => {
    if (state === "playing") {
      if (audioRef.current) audioRef.current.pause();
      else window.speechSynthesis.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      if (audioRef.current) void audioRef.current.play();
      else window.speechSynthesis.resume();
      setState("playing");
      return;
    }
    const text = result.explanation[tab];
    const speak = () => {
      if (!synthOk()) return stop();
      audioRef.current = null;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[tab]; // en-IN / hi-IN
      u.onboundary = (e) => setProgress(text.length > 0 ? Math.min(1, e.charIndex / text.length) : 0);
      u.onend = () => stop();
      u.onerror = () => stop();
      window.speechSynthesis.speak(u);
      setState("playing");
    };
    if (useAudio && result.audioUrl) {
      const audio = new Audio(buildUrl(CRYPTO_API_BASE, result.audioUrl));
      audioRef.current = audio;
      let fellBack = false;
      const fallBack = () => {
        if (fellBack) return;
        fellBack = true;
        speak();
      };
      audio.ontimeupdate = () => setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
      audio.onended = () => stop();
      audio.onerror = fallBack;
      void audio.play().then(() => setState("playing"), fallBack);
    } else {
      speak();
    }
  }, [result.audioUrl, result.explanation, state, stop, tab, useAudio]);

  return { state, progress, supported, toggle };
}

/** The explanation in English and Hindi (tabs) with a Listen button. It only repeats what the evidence says. */
export default function ExplanationPanel({ result, requestLang, className }: { result: CheckResponse; requestLang: Lang; className?: string }) {
  const { g } = useGuardT();
  const [picked, setPicked] = useState<Lang | null>(null);
  const tab: Lang = picked ?? requestLang;
  const listen = useListen(result, tab, requestLang);
  const insufficient = result.status !== "ok" || INSUFFICIENT.test(result.explanation[tab]);
  const tabs: Lang[] = ["en", "hi"];

  const onKey = (e: React.KeyboardEvent, current: Lang) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = current === "en" ? "hi" : "en";
    setPicked(next);
    document.getElementById(`wg-tab-${next}`)?.focus();
  };

  return (
    <Card className={cn("flex flex-col gap-4 p-5 sm:p-6", className)} aria-labelledby="wg-explain-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wg-explain-title" className="font-display text-lg font-medium text-ink">{g("wg.explain.title")}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-fog px-2.5 py-1 text-[11px] font-semibold text-graphite">
          <ShieldCheck className="size-3.5" aria-hidden />
          {g("wg.explain.basis")}
        </span>
      </div>

      <div role="tablist" aria-label={g("wg.explain.title")} className="inline-flex w-fit rounded-full border border-black/[0.08] bg-fog p-1">
        {tabs.map((l) => (
          <button
            key={l}
            id={`wg-tab-${l}`}
            role="tab"
            type="button"
            lang={l}
            aria-selected={tab === l}
            aria-controls={`wg-panel-${l}`}
            tabIndex={tab === l ? 0 : -1}
            onClick={() => setPicked(l)}
            onKeyDown={(e) => onKey(e, l)}
            className={cn(
              "min-h-9 cursor-pointer rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember",
              tab === l ? "bg-lime text-ink shadow-sm" : "text-graphite hover:text-ink",
            )}
          >
            {l === "en" ? "English" : "हिन्दी"}
          </button>
        ))}
      </div>

      {tabs.map((l) => (
        <div key={l} id={`wg-panel-${l}`} role="tabpanel" aria-labelledby={`wg-tab-${l}`} hidden={tab !== l} className="grid gap-3">
          {insufficient && (
            <p className="rounded-surface bg-fog px-3 py-2 text-xs text-graphite">{g("wg.explain.insufficient")}</p>
          )}
          <p lang={l} className="max-w-prose text-[15px] leading-relaxed text-ink">{result.explanation[l]}</p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {listen.supported && (
          <Button variant="secondary" onClick={listen.toggle} aria-pressed={listen.state === "playing"}>
            {listen.state === "playing" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {listen.state === "playing" ? g("wg.explain.pause") : g("wg.explain.listen")}
          </Button>
        )}
        {listen.supported && <p className="text-[11px] text-pewter">{g("wg.explain.voicenote")}</p>}
      </div>
      {listen.state !== "idle" && (
        <div
          className="h-1.5 rounded-full bg-black/[0.07]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(listen.progress * 100)}
          aria-label={g("wg.explain.listen")}
        >
          <div className="h-full rounded-full bg-ember transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.round(listen.progress * 100)}%` }} />
        </div>
      )}
    </Card>
  );
}
