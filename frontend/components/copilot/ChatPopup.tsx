"use client";

import { safeHref, isInternalHref } from "@/components/safeHref";
import { onOpenAssistant } from "@/lib/copilotBus";
import { getLang, getSimpleNow } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Maximize2, MessageCircle, Mic, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { PromptInputBox } from "@/components/copilot/PromptInputBox";
import { hostOf } from "@/components/copilot/AnswerView";
import { api } from "@/lib/api";
import type { NextStep, SourceLink } from "@/lib/types";
import { useUserId } from "@/lib/hooks";
import { getOfflineOnly } from "@/lib/user";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";
import { useVoiceT } from "@/lib/crypto/voice/strings";
import { messageHasSecret } from "@/lib/crypto/extractAddress";
import { cleanHistory, findSplitSecret, REDACTED } from "@/lib/crypto/secretGuard";
import { runActions, snapshotScreen } from "@/lib/voiceAgent";
import { isRecentTransactionQuestion, pageToOpen, scrollCommand, scrollToSelector, speak, stopSpeaking, useVoiceInput } from "@/lib/voice";

const STARTERS = ["How am I doing financially?", "What deadlines are coming up?", "Where did I spend the most?", "Which govt schemes suit me?"];

/** Renders **bold** from the model as real bold text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  );
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: NextStep[];
  sources?: SourceLink[];
}

/** Floating FinPilot chat in the bottom-right corner. Quick questions; the full Copilot page keeps saved chats. */
const MEM = "finpilot:voice_memory";
/** What was said in earlier voice chats, kept in this browser so the assistant remembers across page loads. */
function recallVoice(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MEM) ?? "[]");
  } catch {
    return [];
  }
}
function rememberVoice(...lines: string[]) {
  try {
    localStorage.setItem(MEM, JSON.stringify([...recallVoice(), ...lines].slice(-8)));
  } catch {}
}

export function ChatPopup() {
  const pathname = usePathname();
  const router = useRouter();
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState("");
  const [secretWarn, setSecretWarn] = useState(false);
  const { tr } = useVoiceT();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading, open]);

  const say = (status: string) => setCaption(status);

  // the voice panel by the mic: what you said (live), then every step the assistant takes
  type Step = { text: string; done: boolean };
  const [log, setLog] = useState<{ heard: string; live: boolean; steps: Step[]; answer: string; over: boolean } | null>(null);
  const patch = (p: Partial<NonNullable<typeof log>>) => setLog((l) => (l ? { ...l, ...p } : l));
  const addStep = (text: string, done = false) => setLog((l) => (l ? { ...l, steps: [...l.steps, { text, done }] } : l));
  /** marks the last unfinished step done (and relabels it), or adds a finished one */
  const doneStep = (text: string) =>
    setLog((l) => {
      if (!l) return l;
      const i = l.steps.findLastIndex((s) => !s.done);
      const steps = i < 0 ? [...l.steps, { text, done: true }] : l.steps.map((s, k) => (k === i ? { text, done: true } : s));
      return { ...l, steps };
    });

  const voice = useVoiceInput(
    (text) => {
      // a spoken seed phrase or key is never shown, sent or remembered
      patch({ heard: messageHasSecret(text) ? "" : text, live: false });
      void send(text, true);
    },
    (problem) => {
      setLog(null);
      setCaption(problem);
    },
    (live) => setLog((l) => ({ heard: messageHasSecret(live) ? "" : live, live: true, steps: l?.steps ?? [], answer: "", over: false })),
  );

  const startVoice = () => {
    stopSpeaking();
    setLog({ heard: "", live: true, steps: [], answer: "", over: false });
    voice.start();
  };

  // the panel fades 25 s after the assistant finishes
  useEffect(() => {
    if (!log?.over) return;
    const t = setTimeout(() => setLog(null), 25000);
    return () => clearTimeout(t);
  }, [log?.over]);

  // the spoken answer also shows as a short caption by the mic, then fades
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(""), 9000);
    return () => clearTimeout(t);
  }, [caption]);

  // keep the latest voice/startVoice/pathname in a ref so the subscription below is made once
  const latestRef = useRef({ voice, startVoice, pathname });
  useEffect(() => {
    latestRef.current = { voice, startVoice, pathname };
  });
  useEffect(
    () =>
      onOpenAssistant(() => {
        const { voice: v, startVoice: start, pathname: p } = latestRef.current;
        if (p.startsWith("/copilot")) return; // the popup renders nothing on the full Copilot page
        setOpen(true);
        stopSpeaking();
        if (v.supported && !v.listening) start();
      }),
    [],
  );

  if (pathname.startsWith("/copilot")) return null;

  /** Answers locally for "open X" and "my latest transaction"; everything else goes to the Copilot. */
  async function answer(message: string, history: { role: "user" | "assistant"; content: string }[]): Promise<Msg> {
    const scrolled = scrollCommand(message);
    if (scrolled) return { role: "assistant", text: scrolled };
    if (isRecentTransactionQuestion(message)) {
      say("Looking up your latest transaction...");
      const t = (await api.transactions(userId, { page_size: 1 })).items[0];
      say("Opening the Transactions page...");
      router.push("/transactions", { scroll: false }); // so Next does not jump back to the top after we scroll
      void scrollToSelector("/transactions", "table tbody tr").then((ok) => ok && say("Scrolled to your latest transaction."));
      if (!t) return { role: "assistant", text: "You have no transactions yet. Opening your transactions page." };
      const verb = t.amount < 0 ? "spent" : "received";
      return {
        role: "assistant",
        text: `Your most recent transaction: you ${verb} ${formatCurrency(Math.abs(t.amount))} ${t.amount < 0 ? "at" : "from"} ${t.merchant} on ${formatDate(t.date)}. I have opened your transactions.`,
      };
    }
    const page = pageToOpen(message);
    if (page) {
      say(`Opening ${page.label}...`);
      router.push(page.path, { scroll: !page.target });
      if (page.target) void scrollToSelector(page.path, page.target);
      return { role: "assistant", text: `Opening ${page.label}.` };
    }
    say("Thinking about your question...");
    const a = await api.chat(message, userId, "auto", history);
    return { role: "assistant", text: a.narrative || "I could not find an answer to that.", steps: a.next_steps, sources: a.sources };
  }

  async function send(text?: string, spoken = false) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    // seed phrases and private keys (also split over several messages) never leave the input: nothing is sent, shown or stored
    const earlier = msgs.filter((m) => m.role === "user").map((m) => m.text);
    const split = findSplitSecret(earlier, message);
    if (split >= 0) {
      setInput("");
      setSecretWarn(true);
      setLog(null);
      if (split > 0) {
        // the earlier pieces were already sent once; hide them and never send them again in the history
        const users = msgs.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0).slice(-split);
        setMsgs((all) => all.map((m, i) => (users.includes(i) ? { ...m, text: REDACTED } : m)));
      }
      return;
    }
    setSecretWarn(false);
    const history = cleanHistory(msgs.slice(-8).map((m) => ({ role: m.role, content: m.text })));
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    let reply: Msg | undefined;
    let voiced = false;
    try {
      if (spoken) {
        // spoken questions go to the voice agent first: it sees the screen, thinks out loud, answers like a person and can open, scroll and click
        setLog((l) => ({ heard: message, live: false, steps: [], answer: "", over: false, ...l }));
        addStep("Reading what is on your screen…");
        const plan = await api.voiceAct(message, pathname, getLang(), snapshotScreen(), [...recallVoice(), ...history.map((h) => `${h.role}: ${h.content}`.slice(0, 200)).slice(-4)].slice(-8), userId).catch(() => null);
        if (!plan) {
          doneStep("The assistant is busy, using the normal chat instead");
        } else {
          doneStep(plan.thinking ? `Thinking: ${plan.thinking}` : "Understood");
          if (plan.say) {
            speak(plan.say);
            patch({ answer: plan.say });
          }
          if (plan.actions.length) {
            await new Promise((r) => setTimeout(r, 1400)); // think first, then act
            await runActions(plan.actions, (p) => router.push(p), (text, done) => (done ? doneStep(text) : addStep(text)));
            if (plan.actions.some((x) => x.type === "navigate")) {
              addStep("Reading the new screen…");
              const next = await api.voiceAct(`${message} (I have just opened the new screen for you; now finish the task using what is on it: click the control that does it if there is one, otherwise explain the next step)`, location.pathname, getLang(), snapshotScreen(), [], userId).catch(() => null);
              if (next?.actions.length) await runActions(next.actions.filter((x) => x.type !== "navigate"), (p) => router.push(p), (text, done) => (done ? doneStep(text) : addStep(text)));
              doneStep("Done");
              if (next?.say) {
                speak(next.say);
                patch({ answer: next.say });
                setMsgs((m) => [...m, { role: "assistant", text: next.say }]);
              }
            }
          }
          if (!plan.ask_copilot && plan.say) {
            reply = { role: "assistant", text: plan.say };
            voiced = true;
          }
          if (plan.ask_copilot) addStep("Checking your data…");
        }
        if (plan?.say) rememberVoice(`user: ${message}`.slice(0, 200), `assistant: ${plan.say}`.slice(0, 200));
        patch({ over: !plan?.ask_copilot });
      }
      reply ??= await answer(message, history);
      if (spoken && !voiced) {
        doneStep("Done");
        patch({ answer: reply.text.replace(/\*\*/g, ""), over: true });
      }
    } catch {
      if (spoken) patch({ over: true });
      reply = { role: "assistant", text: "Sorry, I couldn't answer right now. Please try again in a minute." };
    }
    setMsgs((m) => [...m, reply]);
    setLoading(false);
    if (!voiced && (spoken || getSimpleNow())) {
      speak(reply.text); // asked by voice (or simple view) -> answered by voice
      setCaption(reply.text.replace(/\*\*/g, ""));
    }
  }

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex flex-col items-end gap-3 md:bottom-5 md:right-5">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="flex h-[min(560px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center gap-2.5 bg-ink px-4 py-3 text-white">
              <span className="grid size-8 place-items-center rounded-full bg-lime text-ink">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">FinPilot</p>
                <p className="text-[11px] text-white/60">Ask me about your money</p>
              </div>
              {msgs.length > 0 && (
                <button onClick={() => setMsgs([])} title="New chat" aria-label="New chat" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                  <RotateCcw className="size-4" />
                </button>
              )}
              <Link href="/copilot" title="Open full Copilot" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <Maximize2 className="size-4" />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-sage/30 p-4">
              {msgs.length === 0 && (
                <div className="rounded-2xl bg-white p-3.5 text-sm leading-relaxed text-graphite">
                  Hi, I&apos;m FinPilot. Ask about your spending, debts, tax deadlines or government schemes.
                  {getOfflineOnly() && <span className="mt-1 block text-[11px] text-pewter">Offline mode is on: basic answers only.</span>}
                </div>
              )}
              {msgs.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <button key={q} onClick={() => send(q)} className="rounded-full border border-olive/25 bg-white px-3 py-1.5 text-xs text-olive transition-colors hover:bg-tint-lime">
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white"
                        : "max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm leading-relaxed text-ink"
                    }
                  >
                    <p className="whitespace-pre-line">
                      <Rich text={m.text} />
                    </p>
                    {m.steps?.slice(0, 2).map((s, k) => (
                      <p key={k} className="mt-1.5 text-xs text-olive">
                        →{" "}
                        {s.link ? (
                          isInternalHref(s.link) ? (
                            <Link href={s.link} className="font-medium underline">{s.title}</Link>
                          ) : (
                            <a href={safeHref(s.link)} target="_blank" rel="noreferrer" className="font-medium underline">{s.title}</a>
                          )
                        ) : (
                          <span className="font-medium">{s.title}</span>
                        )}
                      </p>
                    ))}
                    {m.sources && m.sources.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-pewter">Sources: {m.sources.map((s) => hostOf(s.url)).join(", ")}</p>
                    )}
                  </div>
                </div>
              ))}
              {secretWarn && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <p className="min-w-0 flex-1">
                    <span className="font-semibold">{tr("cp.secret.title")}</span> {tr("cp.secret.body")}
                  </p>
                  <button type="button" onClick={() => setSecretWarn(false)} aria-label={tr("cp.secret.dismiss")} className="rounded-full p-0.5 hover:bg-rose-100">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              {loading && <p className="animate-pulse text-xs text-pewter">FinPilot is thinking…</p>}
              <div ref={endRef} />
            </div>

            <div className="bg-white p-2.5">
              <PromptInputBox
                value={input}
                onChange={(v) => {
                  if (messageHasSecret(v)) {
                    setInput("");
                    setSecretWarn(true);
                  } else setInput(v);
                }}
                onSend={() => send()}
                isLoading={loading}
                placeholder="Ask FinPilot..."
                footer={
                  voice.supported && (
                    <button
                      type="button"
                      onClick={() => {
                        if (voice.listening) return voice.stop();
                        stopSpeaking();
                        startVoice();
                      }}
                      aria-label={voice.listening ? "Stop listening" : "Ask by voice"}
                      className={`flex items-center gap-1.5 rounded-full px-2 py-1 ${voice.listening ? "animate-pulse bg-lime text-ink" : "hover:bg-fog"}`}
                    >
                      <Mic className="size-3.5" /> {voice.listening ? "Listening…" : "Speak"}
                    </button>
                  )
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {log && (
        <div className="w-[min(340px,calc(100vw-2rem))] rounded-2xl bg-ink p-3.5 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{log.live ? "Listening…" : "You said"}</span>
            <button onClick={() => setLog(null)} aria-label="Close voice panel" className="text-white/50 hover:text-white"><X className="size-3.5" /></button>
          </div>
          <p className="mt-1 min-h-5 text-sm leading-snug">
            {log.heard || <span className="text-white/40">Speak now, I will keep listening until you pause…</span>}
            {log.live && <span className="ml-0.5 animate-pulse text-lime">|</span>}
          </p>
          {log.steps.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5 text-xs">
              {log.steps.map((st, i) => (
                <li key={i} className={`flex items-start gap-2 ${st.done ? "text-white/80" : "text-lime"}`}>
                  {st.done ? <Check className="mt-0.5 size-3 shrink-0 text-lime" /> : <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />}
                  <span>{st.text}</span>
                </li>
              ))}
            </ul>
          )}
          {log.answer && <p className="mt-2.5 border-t border-white/10 pt-2.5 text-sm leading-snug text-lime">{log.answer}</p>}
        </div>
      )}
      {caption && !open && (
        <p className="max-w-[min(300px,calc(100vw-6rem))] rounded-2xl bg-ink px-3.5 py-2 text-sm leading-snug text-white shadow-lg">{caption}</p>
      )}
      <button
          onClick={() => {
            if (voice.listening) return voice.stop();
            if (!voice.supported) return setCaption("Voice input needs Chrome, Edge or Safari. Open FinPilot there to talk to it.");
            stopSpeaking();
            setCaption("");
            startVoice();
          }}
          aria-label={voice.listening ? "Stop listening" : "Speak to FinPilot"}
          title={voice.listening ? "Listening… tap to stop" : "Speak to FinPilot"}
          className={`grid size-12 place-items-center rounded-full border border-black/[0.08] shadow-lg transition-transform hover:scale-105 ${voice.listening ? "animate-pulse bg-ink text-lime" : "bg-white text-ink"}`}
        >
          {voice.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
        </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close FinPilot chat" : "Open FinPilot chat"}
        className="grid size-14 place-items-center rounded-full bg-lime text-ink shadow-[0_10px_30px_rgba(95,127,12,0.4)] transition-transform hover:scale-105"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
