"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { BotIcon } from "@animateicons/react/lucide";
import { CalendarClock, ChevronDown, Check, ExternalLink, History, Paperclip, Plus, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";
import { LoopIcon } from "@/components/ui/LoopIcon";
import { PromptInputBox } from "@/components/copilot/PromptInputBox";
import { AnswerView } from "@/components/copilot/AnswerView";
import { DocumentsPanel } from "@/components/copilot/DocumentsPanel";
import { WalletTurn } from "@/components/copilot/WalletTurn";
import MicButton from "@/components/crypto/voice/MicButton";
import { VoiceProviderChip } from "@/components/crypto/voice/VoiceProviderChip";
import type { CheckResponse, Lang as CryptoLang, VoiceProvider } from "@/lib/crypto/api";
import { messageHasSecret, scanAddresses } from "@/lib/crypto/extractAddress";
import { showAnswerBubble } from "@/lib/crypto/walletFirst";
import { SecretInputError } from "@/lib/apiError";
import { cleanHistory, findSplitSecret, REDACTED } from "@/lib/crypto/secretGuard";
import { toCryptoLang } from "@/lib/crypto/lang";
import { engineLabel, useVoiceT, type VoiceStringKey } from "@/lib/crypto/voice/strings";
import { useCryptoStatus } from "@/lib/crypto/voice/useCryptoStatus";
import { SPEECH_LANG } from "@/lib/i18n";
import { pageToOpen, scrollToSelector, speak } from "@/lib/voice";
import { api } from "@/lib/api";
import { newChatId, titleFrom, useChats, type Turn } from "@/lib/chats";
import { useAsync, useUserId } from "@/lib/hooks";
import { onAuthChange } from "@/lib/firebase/auth";
import { getOfflineOnly, setOfflineOnly } from "@/lib/user";
import type { AnswerContract, ChatEngine } from "@/lib/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";

const ENGINES: { id: ChatEngine; name: string; hint: string }[] = [
  { id: "auto", name: "Auto", hint: "FinPilot picks the best way to answer" },
  { id: "deep", name: "Deep", hint: "Careful, checks every number" },
  { id: "fast", name: "Fast", hint: "Quick replies for simple questions" },
];

const STARTERS = [
  "Will I face any cash deficit in the next 90 days?",
  "Which subscriptions can I cancel?",
  "How much interest do I save if I pay ₹5,000 extra on my car loan?",
  "Can I afford to increase my mutual fund SIP by ₹3,000/month?",
];

const PROVIDER_KEYS: Record<VoiceProvider, VoiceStringKey> = { wispr: "cp.voice.wispr", sarvam: "cp.voice.sarvam", browser: "cp.voice.browser" };

const FinPilotAvatar = ({ className }: { className?: string }) => (
  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink", className)}>
    <Sparkles className="size-4" />
  </span>
);

const nowMs = () => Date.now();

/** Key of the wallet card for address number `k` under user message `ui`: the first keeps the plain `${chat}:${ui}` key. */
const walletKey = (chat: string | null, ui: number, k: number) => (k === 0 ? `${chat}:${ui}` : `${chat}:${ui}#${k}`);
/** A wallet question with no address in it: nothing to check yet, so ask for the address instead of sending it to the chat. */
const WALLET_QUESTION = /\b(wallet|bitcoin|btc|crypto)\b/i;

export default function CopilotPage() {
  const userId = useUserId();
  const { chats, save, remove } = useChats(userId);
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const { lang, tr } = useVoiceT();
  // the crypto service speaks en/hi only: the shared mapping sends Marathi as Hindi, same as Wallet Guard
  const cryptoLang: CryptoLang = toCryptoLang(lang);
  const cryptoStatus = useCryptoStatus();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [secretWarn, setSecretWarn] = useState(false);
  const [secretDetail, setSecretDetail] = useState<string | null>(null);
  const [needAddress, setNeedAddress] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider | null>(null);
  // wallet cards, keyed `${chatId}:${index of the user turn}`; only messages sent in this visit run on their own
  const [armed, setArmed] = useState<Record<string, true>>({});
  const [walletResults, setWalletResults] = useState<Record<string, CheckResponse>>({});
  const [evidenceOpen, setEvidenceOpen] = useState<Record<string, true>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState<string | null>(null);
  useEffect(
    () =>
      onAuthChange((u) => {
        const first = u?.displayName?.split(" ")[0] || u?.email?.split("@")[0];
        setSignedInName(first ? first.replace(/^./, (c) => c.toUpperCase()) : null);
      }),
    [],
  );
  const [engine, setEngine] = useState<ChatEngine>("auto");
  const [railOpen, setRailOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const feed = useAsync(useCallback(() => api.schemes(), []), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("finpilot-engine") as ChatEngine | null;
      // localStorage only exists in the browser, so the saved engine is read after mount
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && ENGINES.some((e) => e.id === saved)) setEngine(saved);
    } catch {
      // keep the default engine
    }
  }, []);

  // switching persona starts a clean chat
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setChatId(null);
    setTurns([]);
    setError(null);
    setInput("");
    setArmed({});
    setSecretWarn(false);
    setSecretDetail(null);
    setVoiceProvider(null);
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, loading, error]);

  function pickEngine(id: ChatEngine) {
    setEngine(id);
    try {
      localStorage.setItem("finpilot-engine", id);
    } catch {
      // not persisted, still applied
    }
  }

  function openChat(id: string | null) {
    const c = chats.find((x) => x.id === id);
    setChatId(c ? c.id : null);
    setTurns(c ? c.turns : []);
    setError(null);
    setArmed({});
    setRailOpen(false);
  }

  /** Seed phrases and private keys never leave the input: cleared, not stored, not sent, and a warning shows. */
  function rejectSecret() {
    setInput("");
    setVoiceProvider(null);
    setSecretDetail(null);
    setSecretWarn(true);
  }

  function changeInput(v: string) {
    if (messageHasSecret(v)) return rejectSecret();
    if (needAddress) setNeedAddress(false);
    setInput(v);
    if (v.trim() === "") setVoiceProvider(null);
  }

  function prefill(text: string) {
    setInput(text);
    setVoiceProvider(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  }

  const router = useRouter();
  /** "open the statement": understood on the device and done at once (no AI call). Returns true if it was a navigation command. */
  function openByVoice(text: string): boolean {
    if (messageHasSecret(text)) return false;
    const nav = pageToOpen(text);
    if (!nav) return false;
    setInput("");
    setVoiceNote(`Opening ${nav.label}…`);
    speak(`Opening ${nav.label}.`);
    router.push(nav.path, { scroll: !nav.target });
    if (nav.target) void scrollToSelector(nav.path, nav.target);
    return true;
  }

  function onTranscript(text: string, provider: VoiceProvider) {
    if (openByVoice(text)) return;
    // the words go into the input for the person to check and edit; they are never sent automatically
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
    setVoiceProvider(provider);
    setSecretWarn(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /** "Explain the graph evidence": explains the latest wallet check of this chat, or prefills the question. */
  function explainEvidence() {
    const keys = Object.keys(walletResults).filter((k) => chatId && k.startsWith(`${chatId}:`));
    const order = (k: string) => Number(k.split(":")[1].replace("#", "."));
    const last = keys.sort((a, b) => order(a) - order(b)).pop();
    if (last) setEvidenceOpen((o) => ({ ...o, [last]: true }));
    else prefill(tr("cp.chip.evidencePrefill"));
  }

  async function send(message: string) {
    if (!message.trim() || loading) return;
    if (openByVoice(message)) return;
    const split = findSplitSecret(turns.filter((t) => t.role === "user").map((t) => t.message), message);
    if (split >= 0) {
      if (split > 0) {
        // earlier halves were already sent once: hide them and never re-send them as history
        const idx = turns.map((t, i) => (t.role === "user" ? i : -1)).filter((i) => i >= 0).slice(-split);
        setTurns((all) => all.map((t, i) => (idx.includes(i) ? { ...t, message: REDACTED } : t)));
      }
      return rejectSecret();
    }
    const id = chatId ?? newChatId();
    const found = scanAddresses(message).scans;
    if (found.length === 0 && WALLET_QUESTION.test(message) && /\b(safe|pay|send|scam|check|trust)/i.test(message)) {
      setNeedAddress(true);
      return;
    }
    setNeedAddress(false);
    setArmed((a) => {
      const next = { ...a };
      found.forEach((f, k) => {
        if (f.checksumValid) next[walletKey(id, turns.length, k)] = true;
      });
      return next;
    });
    setSecretWarn(false);
    setVoiceProvider(null);
    const history = cleanHistory(turns.slice(-8).map((t) => ({ role: t.role, content: t.role === "user" ? t.message : t.answer?.narrative ?? "" })));
    const withUser: Turn[] = [...turns, { role: "user", message }];
    setChatId(id);
    setTurns(withUser);
    setInput("");
    setError(null);
    setLoading(true);
    const title = chats.find((c) => c.id === id)?.title ?? titleFrom(message);
    let answer: AnswerContract | null = null;
    try {
      answer = await api.chat(message, userId, engine, history);
    } catch (err) {
      if (err instanceof SecretInputError) {
        // refused server-side as a seed phrase / key: never keep the text, show the server's friendly explanation
        const redacted: Turn[] = [...turns, { role: "user", message: REDACTED }];
        setTurns(redacted);
        setSecretDetail(err.message);
        setSecretWarn(true);
        save({ id, title: chats.find((c) => c.id === id)?.title ?? "Chat", updatedAt: nowMs(), turns: redacted });
        setLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    if (answer) {
      const done: Turn[] = [...withUser, { role: "assistant", message, answer }];
      setTurns(done);
      save({ id, title, updatedAt: nowMs(), turns: done });
    } else {
      save({ id, title, updatedAt: nowMs(), turns: withUser });
    }
    setLoading(false);
  }

  const empty = turns.length === 0 && !loading && !error;
  const persona = signedInName ?? (userId.startsWith("demo-") ? userId.slice(5).replace(/^./, (c) => c.toUpperCase()) : "there");
  const today = new Date().toDateString();
  const groups = useMemo(
    () => [
      { label: "Today", items: chats.filter((c) => new Date(c.updatedAt).toDateString() === today) },
      { label: "Earlier", items: chats.filter((c) => new Date(c.updatedAt).toDateString() !== today) },
    ],
    [chats, today],
  );
  const current = ENGINES.find((e) => e.id === engine)!;
  const scans = useMemo(() => turns.map((t) => (t.role === "user" ? scanAddresses(t.message) : null)), [turns]);

  /** The wallet verdict (or checksum note) for the user message at index `ui`; talks to the crypto service, not the chat backend. */
  const walletFor = (ui: number) => {
    const found = scans[ui];
    if (!found || found.scans.length === 0) return null;
    return (
      <motion.div key={`w${ui}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-11 flex min-w-0 flex-col gap-3">
        {found.scans.map((sc, k) => {
          const key = walletKey(chatId, ui, k);
          return (
            <WalletTurn
              key={sc.address}
              address={sc.address}
              checksumValid={sc.checksumValid}
              lang={cryptoLang}
              armed={!!armed[key]}
              onArm={() => setArmed((a) => ({ ...a, [key]: true }))}
              result={walletResults[key]}
              onResult={(r) => setWalletResults((m) => ({ ...m, [key]: r }))}
              evidenceOpen={!!evidenceOpen[key]}
            />
          );
        })}
        {found.ignored > 0 && <p role="note" className="text-xs text-graphite">{tr("cp.wallet.more")}</p>}
      </motion.div>
    );
  };

  const chipCls = "cursor-pointer rounded-full border border-ember/30 bg-orange-50/60 px-3.5 py-2 text-xs text-ember-dark transition-colors hover:bg-orange-50";
  const cryptoChips = (
    <>
      <li>
        <button type="button" onClick={() => prefill(tr("cp.chip.checkPrefill"))} className={chipCls}>
          {tr("cp.chip.check")}
        </button>
      </li>
      <li>
        <button type="button" onClick={explainEvidence} className={chipCls}>
          {tr("cp.chip.evidence")}
        </button>
      </li>
    </>
  );

  const rail = (
    <div className="flex h-full w-72 shrink-0 flex-col gap-3 bg-sage/50 p-3">
      <button
        type="button"
        onClick={() => openChat(null)}
        className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-tint-lime"
      >
        <Plus className="size-4" /> New chat
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats.length === 0 && <p className="px-2 pt-2 text-xs text-graphite">Your chats will be saved here.</p>}
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.label} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-pewter">{g.label}</p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={cn("group flex items-center rounded-xl pr-1 transition-colors", c.id === chatId ? "bg-white shadow-sm" : "hover:bg-white/70")}
                  >
                    <button type="button" onClick={() => openChat(c.id)} className="min-w-0 flex-1 cursor-pointer truncate px-3 py-2 text-left text-sm text-ink">
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete chat ${c.title}`}
                      onClick={() => {
                        remove(c.id);
                        if (c.id === chatId) openChat(null);
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-pewter opacity-0 transition hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ),
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[460px] overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-black/[0.05]">
      <aside className="hidden lg:block">{rail}</aside>
      <AnimatePresence>
        {railOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setRailOpen(false)}>
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="h-full w-72" onClick={(e) => e.stopPropagation()}>
              {rail}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <button type="button" aria-label="Chat history" onClick={() => setRailOpen(true)} className="cursor-pointer rounded-full p-2 text-graphite hover:bg-fog lg:hidden">
            <History className="size-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink outline-none transition-colors hover:bg-fog">
              FinPilot <span className="font-normal text-graphite">{current.name}</span> <ChevronDown className="size-4 text-pewter" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {ENGINES.map((e) => (
                <DropdownMenuItem key={e.id} onClick={() => pickEngine(e.id)} className="flex cursor-pointer items-start gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-graphite">{e.hint}</span>
                  </span>
                  {e.id === engine && <Check className="mt-0.5 size-4 text-olive" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs text-graphite transition-colors hover:bg-fog">
            <input type="checkbox" defaultChecked={getOfflineOnly()} onChange={(e) => setOfflineOnly(e.target.checked)} className="size-3.5 cursor-pointer rounded accent-ember" />
            Keep my data on this device
          </label>
        </header>

        {/* thread: the only part that scrolls, full width so the scrollbar sits at the edge */}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto flex w-full max-w-3xl flex-col px-4 pb-6", empty ? "min-h-full justify-center gap-6 pt-6" : "gap-7 pt-2")}>
            {empty ? (
              <>
                <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center font-display text-3xl font-medium text-ink sm:text-4xl">
                  Hey, {persona}. Ready to dive in?
                </motion.h1>

                {/* friend-style nudges about deadlines and schemes */}
                <div className="grid gap-3">
                  {feed.data?.nudges.map((n, i) => (
                    <motion.button
                      key={n}
                      type="button"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + i * 0.35 }}
                      onClick={() => send(`Tell me more and what I should do: ${n}`)}
                      className="flex cursor-pointer items-start gap-3 text-left"
                    >
                      <FinPilotAvatar />
                      <span className="rounded-2xl rounded-tl-sm bg-tint-lime px-4 py-3 text-sm text-ink transition-colors hover:bg-lime/60">{n}</span>
                    </motion.button>
                  ))}
                  {feed.data && (
                    <button type="button" onClick={() => setShowAll(!showAll)} className="ml-11 flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-olive hover:underline">
                      <CalendarClock className="size-3.5" /> {showAll ? "Hide" : "See all"} deadlines and schemes
                    </button>
                  )}
                  <AnimatePresence initial={false}>
                    {showAll && feed.data && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="ml-11 overflow-hidden rounded-2xl bg-sage/60">
                        <div className="grid gap-4 p-4 text-sm">
                          <ul className="grid gap-2">
                            {feed.data.deadlines.map((d) => (
                              <li key={d.id} className="flex items-baseline gap-3">
                                <span className="w-20 shrink-0 text-xs font-semibold tnum text-olive">{new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</span>
                                <span className="min-w-0 flex-1 text-ink">
                                  <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                                    {d.name} <ExternalLink className="size-3 text-pewter" />
                                  </a>
                                  <span className="block text-xs text-graphite">{d.what}</span>
                                </span>
                                <span className="shrink-0 text-xs text-graphite tnum">{d.days_left} days</span>
                              </li>
                            ))}
                          </ul>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-pewter">Always open</p>
                            <ul className="grid gap-1.5">
                              {feed.data.always_open.map((s) => (
                                <li key={s.name} className="text-xs text-graphite">
                                  <a href={s.link} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                                    {s.name}
                                  </a>
                                  {" · "}
                                  {s.what}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <p className="text-[11px] text-pewter">{feed.data.note}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <ul className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map((q) => (
                    <li key={q}>
                      <button type="button" onClick={() => send(q)} className="cursor-pointer rounded-full border border-black/[0.08] px-3.5 py-2 text-xs text-graphite transition-colors hover:bg-fog hover:text-ink">
                        {q}
                      </button>
                    </li>
                  ))}
                  {cryptoChips}
                </ul>
              </>
            ) : (
              <>
                {turns.flatMap((t, i) => {
                  const out: React.ReactNode[] = [];
                  if (t.role === "user") {
                    out.push(
                      <motion.div key={`u${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[85%] rounded-3xl bg-sage px-5 py-3 text-sm text-ink sm:max-w-[75%]">
                        {t.message}
                      </motion.div>,
                    );
                    // a wallet question shows the wallet card first, then (if it says anything useful) the chat answer
                    out.push(walletFor(i));
                  } else {
                    if (turns[i - 1]?.role === "user" && !showAnswerBubble(scans[i - 1]?.scans.length ?? 0, t.answer?.narrative)) return out;
                    out.push(
                      <motion.div key={`a${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex w-full gap-3">
                        <FinPilotAvatar className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="mb-1.5 text-xs font-semibold text-ink">FinPilot</p>
                          {t.answer && <AnswerView answer={t.answer} />}
                        </div>
                      </motion.div>,
                    );
                  }
                  return out;
                })}
                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-lime text-ink">
                      <LoopIcon icon={BotIcon} size={18} every={1500} />
                    </span>
                    <span className="text-sm text-graphite">Thinking</span>
                    <span className="flex gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-pewter" />
                      <span className="size-1.5 animate-bounce rounded-full bg-pewter [animation-delay:0.2s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-pewter [animation-delay:0.4s]" />
                    </span>
                  </motion.div>
                )}
                {error && (
                  <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700">
                    <X className="mt-0.5 size-4 shrink-0" /> Could not reach FinPilot: {error}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* input: always the same place, so it never jumps */}
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => setDocsOpen((o) => !o)}
            aria-expanded={docsOpen}
            className="mb-2 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-olive transition-colors hover:bg-tint-lime"
          >
            <Paperclip className="size-3.5" /> Add documents
          </button>
          {docsOpen && (
            <div className="mb-2">
              <DocumentsPanel userId={userId} />
            </div>
          )}
          {needAddress && (
            <p role="status" className="mb-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
              {tr("cp.wallet.needAddress")}
            </p>
          )}
          {secretWarn && (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-700">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{tr("cp.secret.title")}</span> {secretDetail ?? tr("cp.secret.body")}
              </p>
              <button type="button" onClick={() => setSecretWarn(false)} aria-label={tr("cp.secret.dismiss")} className="cursor-pointer rounded-full p-0.5 hover:bg-rose-100">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {!empty && <ul className="mb-2 flex flex-wrap gap-2">{cryptoChips}</ul>}
          {voiceNote && <p role="status" className="mb-2 px-2 text-xs font-medium text-ink">{voiceNote}</p>}
          <PromptInputBox
            value={input}
            onChange={changeInput}
            onSend={() => send(input)}
            isLoading={loading}
            textareaRef={textareaRef}
            placeholder={tr("cp.input.placeholder")}
            footer="Numbers come from your own records. Dates follow the usual calendar, so confirm on the official site."
            actions={
              <MicButton
                lang={cryptoLang}
                speechTag={SPEECH_LANG[lang]}
                onTranscript={onTranscript}
                onSecret={rejectSecret}
                disabled={loading}
              />
            }
          />
          {(voiceProvider || cryptoStatus) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[11px] text-pewter">
              {voiceProvider && (
                <>
                  <VoiceProviderChip provider={voiceProvider} />
                  <span>{tr("cp.voice.review")}</span>
                </>
              )}
              {cryptoStatus && (
                <span data-testid="crypto-status">
                  {tr("cp.status.online")}
                  {cryptoStatus.mocks ? ` (${tr("cp.status.mocks")})` : ""}
                  {engineLabel(cryptoStatus.engine) ? ` · ${tr("cp.status.engine")}: ${engineLabel(cryptoStatus.engine)}` : ""}
                  {cryptoStatus.voiceProvider ? ` · ${tr("cp.status.voice")}: ${tr(PROVIDER_KEYS[cryptoStatus.voiceProvider])}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
