"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ClipboardPaste, Coins, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { looksLikeSecret } from "@/lib/crypto/address/seedGuard";
import { validateAddressStrict as validateAddress } from "@/lib/crypto/address/validate";
import { findRecent, useWalletCheck, type WalletCheckState } from "@/lib/crypto/useWalletCheck";
import { cn } from "@/lib/utils";
import { openCreditsDrawer } from "@/components/crypto/credits/openCredits";
import AttestButton from "@/components/crypto/web3/AttestButton";
import { EvidenceGraph } from "@/components/crypto/graph/EvidenceGraph";
import { useGuardT, verdictWord } from "./copy";
import DemoChips from "./DemoChips";
import DetailsPanel from "./DetailsPanel";
import ExplanationPanel from "./ExplanationPanel";
import ProgressSteps from "./ProgressSteps";
import VerdictCard from "./VerdictCard";

const INPUT =
  "min-h-12 w-full min-w-0 rounded-chip border bg-white px-3 pr-24 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ember sm:text-[15px]";


function ErrorPanel({ state, onRetry }: { state: Extract<WalletCheckState, { phase: "error" }>; onRetry: () => void }) {
  const { g } = useGuardT();
  const credits = state.action === "open-credits";
  const retryable = state.action === "retry-later" || state.action === "check-connection" || state.action === "none";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-card border p-5",
        credits ? "border-amber-300 bg-amber-50" : "border-rose-200 bg-rose-50",
      )}
    >
      <div className="flex items-start gap-3">
        {credits ? <Coins className="mt-0.5 size-5 flex-none text-amber-800" aria-hidden /> : <AlertCircle className="mt-0.5 size-5 flex-none text-rose-700" aria-hidden />}
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", credits ? "text-amber-900" : "text-rose-900")}>
            {credits ? g("wg.error.credits.title") : state.action === "fix-address" ? g("wg.error.invalid.title") : g("wg.error.title")}
          </p>
          <p className="mt-1 text-sm text-graphite">{state.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {credits && (
          <Button variant="lime" onClick={openCreditsDrawer}>
            <Coins className="size-4" aria-hidden />
            {g("wg.error.credits.cta")}
          </Button>
        )}
        {retryable && !credits && <Button variant="secondary" onClick={onRetry}>{g("wg.error.retry")}</Button>}
      </div>
    </div>
  );
}

/**
 * The Wallet Guard experience: address input (+ demo chips, seed-phrase guard), progress steps, then the verdict,
 * evidence graph, EN/HI explanation, attestation and details. Reads an optional `?address=` query param
 * (prefill + auto-run once). Must be rendered under a Suspense boundary (useSearchParams).
 */
export default function WalletGuard() {
  const { g, uiLang, reqLang } = useGuardT();
  const params = useSearchParams();
  const { state, run, reset } = useWalletCheck();
  const initial = params.get("address");
  const initialIsSecret = Boolean(initial) && looksLikeSecret(initial ?? "");
  const [value, setValue] = useState(() => (initial && !initialIsSecret ? initial.trim() : ""));
  const [secretNotice, setSecretNotice] = useState(initialIsSecret);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  const trimmed = value.trim();
  const check = validateAddress(trimmed, { allowDemo: true });
  const busy = state.phase === "checking";
  // ?run=1 never spends a credit: when nothing was shown (no remembered result), say what to do instead of looking broken
  const linkHint = params.get("run") === "1" && !initialIsSecret && state.phase === "idle" && trimmed !== "" && trimmed === (initial ?? "").trim() && check.ok;
  const fmtError = trimmed !== "" && !check.ok ? (check.reason === "mixed_case" ? g("wg.input.err.mixed") : check.reason === "checksum" ? g("wg.input.err.checksum") : g("wg.input.err.format")) : null;

  /** Anything that looks like a seed phrase or private key is wiped and never sent. */
  const guardSecret = useCallback((text: string): boolean => {
    if (!looksLikeSecret(text)) return false;
    setValue("");
    setSecretNotice(true);
    inputRef.current?.focus();
    return true;
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      if (guardSecret(raw)) return;
      const v = validateAddress(raw.trim(), { allowDemo: true });
      if (!v.ok) return;
      setSecretNotice(false);
      const done = await run(v.address, reqLang);
      if (done?.phase === "error" && done.action === "seed-phrase-warning") {
        setValue("");
        setSecretNotice(true);
      }
    },
    [guardSecret, reqLang, run],
  );

  // Deep link from the Copilot card: /wallet-guard?address=...&run=1 prefills the field and, ONLY when this address was
  // already checked in this session (a free, remembered result), shows that result. Otherwise it only prefills: a link
  // must never spend a credit. The effect runs once (the ref survives StrictMode's double effect) and the language is
  // latched at that moment.
  useEffect(() => {
    if (autoRan.current || !initial || initialIsSecret || params.get("run") !== "1") return;
    autoRan.current = true;
    const v = validateAddress(initial.trim(), { allowDemo: true });
    if (v.ok && findRecent(v.address)) void run(v.address, reqLang, { reuse: true });
  }, [initial, initialIsSecret, params, reqLang, run]);

  // On small screens bring the result into view when it arrives.
  const done = state.phase === "done";
  useEffect(() => {
    if (!done || window.innerWidth >= 1024) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [done]);

  const onChange = (text: string) => {
    if (guardSecret(text)) return;
    setValue(text);
    if (secretNotice) setSecretNotice(false);
  };

  const paste = async () => {
    try {
      onChange(await navigator.clipboard.readText());
    } catch {
      inputRef.current?.focus();
    }
  };

  const result = state.phase === "done" ? state.result : null;

  return (
    <div className="mx-auto flex max-w-6xl min-w-0 flex-col gap-6 pb-16">
      <div className="border-b border-black/[0.04] pb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ember-dark">
          <ShieldCheck className="size-4" aria-hidden />
          AI × Crypto
        </div>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink sm:text-3xl">{g("wg.title")}</h1>
        <p className="mt-1 max-w-3xl text-xs text-graphite sm:text-sm">{g("wg.sub")}</p>
      </div>

      <Card className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(value);
          }}
        >
          <label htmlFor="wg-address" className="text-xs font-semibold text-graphite">{g("wg.input.label")}</label>
          <div className="relative min-w-0">
            <input
              id="wg-address"
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={g("wg.input.placeholder")}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={busy}
              aria-invalid={fmtError ? true : undefined}
              aria-describedby="wg-address-help"
              className={cn(INPUT, fmtError ? "border-rose-400" : check.ok ? "border-emerald-400" : "border-black/[0.1]", busy && "opacity-60")}
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
              {value && !busy ? (
                <button
                  type="button"
                  onClick={() => {
                    setValue("");
                    inputRef.current?.focus();
                  }}
                  aria-label={g("wg.input.clear")}
                  className="inline-flex size-9 cursor-pointer items-center justify-center rounded-chip text-graphite hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={paste}
                disabled={busy}
                aria-label={g("wg.input.paste")}
                title={g("wg.input.paste")}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-chip text-graphite hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember disabled:opacity-40"
              >
                <ClipboardPaste className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <p id="wg-address-help" aria-live="polite" className="min-h-4 text-xs">
            {fmtError ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-rose-700"><AlertCircle className="size-3.5" aria-hidden />{fmtError}</span>
            ) : check.ok ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden />{g("wg.input.valid")}</span>
            ) : null}
          </p>

          {secretNotice && (
            <div role="alert" className="flex items-start gap-3 rounded-card border border-rose-300 bg-rose-50 p-4">
              <ShieldAlert className="mt-0.5 size-5 flex-none text-rose-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rose-900">{g("wg.secret.title")}</p>
                <p className="mt-1 text-sm text-graphite">{g("wg.secret.body")}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button id="wg-submit" type="submit" variant="lime" size="lg" disabled={!check.ok || busy}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              {busy ? g("wg.checking") : g("wg.check")}
            </Button>
            <p className="text-xs text-pewter">{g("wg.check.cost")}</p>
          </div>
          {linkHint && (
            <p role="status" className="rounded-card border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">{g("wg.deeplink.hint")}</p>
          )}
        </form>

        <DemoChips
          selected={trimmed}
          disabled={busy}
          onPick={(addr) => {
            onChange(addr);
            requestAnimationFrame(() => document.getElementById("wg-submit")?.focus());
          }}
        />
      </Card>

      {state.phase === "checking" && (
        <Card aria-live="polite" className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-medium text-ink">{g("wg.progress.title")}</h2>
            <Button variant="ghost" size="sm" onClick={reset}>{g("wg.progress.cancel")}</Button>
          </div>
          <ProgressSteps steps={state.steps} />
          <div aria-hidden className="grid gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-16 w-3/5 rounded-surface" />
          </div>
        </Card>
      )}

      {state.phase === "error" && state.action !== "seed-phrase-warning" && <ErrorPanel state={state} onRetry={() => void submit(value || state.address)} />}

      <div ref={resultRef} className="scroll-mt-24">
        {result && state.phase === "done" ? (
          <>
            <p className="sr-only" role="status">
              {result.riskScore === null
                ? g("wg.announce.na", { verdict: verdictWord(uiLang, result.verdict) })
                : g("wg.announce", { verdict: verdictWord(uiLang, result.verdict), score: Math.round(result.riskScore) })}
            </p>
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-12">
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
                <VerdictCard result={result} />
                <ExplanationPanel key={`${result.address}:${result.reportHash ?? ""}`} result={result} requestLang={state.lang} />
              </div>
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
                <EvidenceGraph result={result} />
                {result.status === "ok" && <AttestButton response={result} />}
                <DetailsPanel result={result} />
              </div>
            </div>
          </>
        ) : state.phase === "idle" ? (
          <div className="flex flex-col items-center gap-2 rounded-surface border border-dashed border-mist px-6 py-10 text-center">
            <ShieldCheck className="size-6 text-steel" aria-hidden />
            <p className="text-sm font-semibold text-ink">{g("wg.empty.title")}</p>
            <p className="max-w-md text-sm text-graphite">{g("wg.empty.body")}</p>
            <p className="mt-2 max-w-md text-xs text-pewter">{g("wg.honesty")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
