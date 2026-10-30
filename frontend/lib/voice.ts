"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getLang, SPEECH_LANG } from "@/lib/i18n";
import { matchNavigation } from "@/lib/voiceNav";

// The browser's own speech engines: free, no key needed. Works in Chrome, Edge and Safari.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_PROBLEMS: Record<string, string> = {
  "not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
  "service-not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
  "audio-capture": "No microphone found. Plug one in and try again.",
  "network": "Speech recognition needs an internet connection (and Chrome or Edge).",
  "no-speech": "I did not hear anything. Tap the mic and try again.",
};

/** Push-to-talk: `start()` keeps listening until you pause for ~2 seconds (or tap stop), shows words live via `onLive`, then calls `onText` once with everything said. */
export function useVoiceInput(onText: (text: string) => void, onProblem?: (message: string) => void, onLive?: (text: string) => void) {
  const supported = useSyncExternalStore(() => () => {}, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  const problem = useRef(onProblem);
  const live = useRef(onLive);
  useEffect(() => {
    cb.current = onText;
    problem.current = onProblem;
    live.current = onLive;
  });

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[getLang()];
    r.interimResults = true;
    r.continuous = true; // one sentence is not the whole request: keep listening through short pauses
    let said = "";
    let silence: ReturnType<typeof setTimeout> | undefined;
    const quiet = () => {
      clearTimeout(silence);
      silence = setTimeout(() => r.stop(), 2200);
    };
    const hardStop = setTimeout(() => r.stop(), 40000);
    r.onresult = (e) => {
      said = Array.from(e.results, (x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      live.current?.(said);
      quiet();
    };
    r.onend = () => {
      clearTimeout(silence);
      clearTimeout(hardStop);
      setListening(false);
      if (said) cb.current(said);
      else if (!failed) problem.current?.("I did not hear anything. Tap the mic and try again.");
    };
    let failed = false;
    r.onerror = (e) => {
      failed = true;
      setListening(false);
      problem.current?.(MIC_PROBLEMS[e.error] ?? `Voice input failed (${e.error}).`);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, start, stop };
}

/** The nicest installed voice for the language: online "Google"/"Natural" voices sound far more human than the default. */
function bestVoice(lang: string): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const score = (v: SpeechSynthesisVoice) => (/natural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.lang.toLowerCase() === lang.toLowerCase() ? 1 : 0);
  return all.sort((a, b) => score(b) - score(a))[0];
}

/** Reads text aloud, sentence by sentence (Chrome cuts off long utterances). Markdown bold and the rupee sign are turned into words. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text.replace(/\*\*/g, "").replace(/₹\s?([\d,]+(?:\.\d+)?)/g, "$1 rupees");
  window.speechSynthesis.cancel();
  const lang = SPEECH_LANG[getLang()];
  const voice = bestVoice(lang);
  for (const part of clean.match(/[^.!?।]+[.!?।]*/g) ?? [clean]) {
    if (!part.trim()) continue;
    const u = new SpeechSynthesisUtterance(part.trim());
    u.lang = lang;
    u.rate = 1.02;
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** "open / go to / show X" (English, Hindi, Marathi, Hinglish) -> the page to open. Questions and tasks return null and go to the AI. */
export function pageToOpen(text: string): { path: string; label: string; target?: string } | null {
  return matchNavigation(text);
}

export function isRecentTransactionQuestion(text: string): boolean {
  return /\b(recent|latest|last)\b.*\btransactions?\b|\btransactions?\b.*\b(recent|latest|last)\b/i.test(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the element (the page may still be loading), scrolls it to the middle and flashes it so the user sees where. */
export async function scrollToSelector(path: string, selector: string, timeoutMs = 8000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  // the URL changes before the new page replaces the old one, so wait for it, then let the swap finish
  while (!location.pathname.startsWith(path) && Date.now() < end) await sleep(100);
  await sleep(800);
  let el = document.querySelector(selector);
  while (!el && Date.now() < end) {
    await sleep(200);
    el = document.querySelector(selector);
  }
  if (!el) return false;
  flash(el);
  return true;
}

/** Eased scroll driven by timers: native smooth scrolling is dropped by some browsers and background tabs. */
export function glideTo(y: number) {
  const from = window.scrollY;
  const to = Math.max(0, y);
  const start = Date.now();
  const id = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / 600);
    window.scrollTo(0, from + (to - from) * (1 - (1 - k) ** 3));
    if (k === 1) clearInterval(id);
  }, 16);
}

export function flash(el: Element) {
  const r = el.getBoundingClientRect();
  glideTo(window.scrollY + r.top - window.innerHeight / 2 + r.height / 2);
  el.animate([{ backgroundColor: "#d9f99d" }, { backgroundColor: "transparent" }], { duration: 2500 });
}

/** "scroll down / up / to the top" or "scroll to <heading text>". Returns what it did, or null if it is not a scroll command. */
export function scrollCommand(text: string): string | null {
  const t = text.toLowerCase();
  if (!/scroll/.test(t)) return null;
  if (/(top|up)/.test(t)) {
    glideTo(/top/.test(t) ? 0 : window.scrollY - window.innerHeight * 0.8);
    return "Scrolling up.";
  }
  if (/(bottom|down)/.test(t)) {
    glideTo(/bottom/.test(t) ? document.documentElement.scrollHeight : window.scrollY + window.innerHeight * 0.8);
    return "Scrolling down.";
  }
  const m = t.match(/scroll (?:to|until|towards?)\s+(?:the\s+)?(.+?)(?:\s+section)?[.?!]*$/);
  const want = m?.[1];
  if (!want) return null;
  const heading = [...document.querySelectorAll("h1,h2,h3,h4")].find((h) => h.textContent?.toLowerCase().includes(want));
  if (!heading) return `I could not find a ${want} section on this page.`;
  flash(heading);
  return `Scrolling to ${want}.`;
}
