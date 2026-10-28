"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, Check, Globe, Copy, FileSearch, FlaskConical, Gauge, Loader2, PenLine, Play, Radar, RotateCcw, ScanSearch, ShieldAlert, Store, Trash2, Repeat2, Database, Waves,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import type { AgentSummary, SecurityFinding, SecurityReport } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";

const AGENTS: { id: string; name: string; job: string; icon: LucideIcon }[] = [
  { id: "data_guardian", name: "Data Guardian", job: "Checks your records for broken or missing data", icon: Database },
  { id: "duplicate_detector", name: "Duplicate Detector", job: "Finds the same payment charged twice", icon: Copy },
  { id: "fraud_hunter", name: "Fraud Hunter", job: "Flags amounts far above your normal spending", icon: Radar },
  { id: "merchant_verifier", name: "Merchant Verifier", job: "Spots fake look-alike shop names", icon: Store },
  { id: "subscription_sleuth", name: "Subscription Sleuth", job: "Watches repeat charges and price rises", icon: Repeat2 },
  { id: "pattern_analyst", name: "Pattern Analyst", job: "Looks for rapid or unusual payment patterns", icon: Waves },
  { id: "web_checker", name: "Web Checker", job: "Looks up risky merchants on the live web", icon: Globe },
  { id: "risk_scorer", name: "Risk Scorer", job: "Turns everything into one risk score", icon: Gauge },
  { id: "verdict_writer", name: "Verdict Writer", job: "Explains the problems and what to do (AI)", icon: PenLine },
];

type Status = "idle" | "running" | "done";
type AgentState = Record<string, { status: Status; info?: Partial<AgentSummary> }>;

const SEV = {
  high: { label: "Serious", cls: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  medium: { label: "Check this", cls: "bg-amber-100 text-amber-700", bar: "bg-amber-400" },
  low: { label: "Minor", cls: "bg-fog text-graphite", bar: "bg-pewter" },
} as const;

const R = 39; // ring radius, % of the stage
const pos = (i: number) => {
  const a = ((-90 + i * (360 / AGENTS.length)) * Math.PI) / 180;
  return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) };
};

function ScoreRing({ score, level, size = 120 }: { score: number; level: string; size?: number }) {
  const color = level === "high" ? "#e5484d" : level === "medium" ? "#e0a30a" : "#5f7f0c";
  const c = 2 * Math.PI * 44;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="#eceee4" strokeWidth="10" />
        <motion.circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1.1, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="font-display text-3xl font-semibold tnum text-ink">
          {score}
        </motion.span>
        <span className="text-[11px] text-graphite">out of 100</span>
      </div>
    </div>
  );
}

/** The stage: your ledger as a document in the middle, the agents around it, evidence beams between them. */
function Stage({ state, report, running, checked }: { state: AgentState; report: SecurityReport | null; running: boolean; checked: number | null }) {
  const doneAll = AGENTS.every((a) => state[a.id]?.status === "done");
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-tint-lime via-white to-sage p-2 shadow-sm">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(#c6f13555_1px,transparent_1px)] [background-size:22px_22px]" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        {AGENTS.map((a, i) => {
          const { x, y } = pos(i);
          const st = state[a.id]?.status ?? "idle";
          const found = (state[a.id]?.info?.findings ?? 0) > 0;
          return (
            <g key={a.id}>
              <motion.line
                x1={50} y1={50} x2={x} y2={y}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.07, duration: 0.5 }}
                stroke={st === "done" ? (found ? "#e5484d" : "#3f7d5c") : st === "running" ? "#a6d11a" : "#cfd4bf"}
                strokeWidth={st === "idle" ? 0.35 : 0.7}
                strokeDasharray={st === "running" ? "1.5 1.5" : st === "idle" ? "1 1.5" : undefined}
                style={{ transition: "stroke 0.4s" }}
              />
              {st === "running" && (
                <motion.circle r={1.4} fill="#a6d11a" initial={{ cx: 50, cy: 50 }} animate={{ cx: [50, x], cy: [50, y], opacity: [1, 1, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeIn" }} />
              )}
            </g>
          );
        })}
      </svg>

      {/* the document being examined */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 16 }}
        className="absolute left-1/2 top-1/2 flex h-[34%] w-[26%] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/[0.06]"
      >
        <AnimatePresence mode="wait">
          {report && doneAll && !running ? (
            <motion.div key="score" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col items-center justify-center gap-1">
              <ScoreRing score={report.risk_score} level={report.risk_level} size={96} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-graphite">Risk score</span>
            </motion.div>
          ) : (
            <motion.div key="doc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
                <FileSearch className="size-3.5 text-leaf" /> Your ledger
              </div>
              <div className="mt-2 grid flex-1 content-start gap-1.5">
                {[90, 70, 85, 55, 80, 65, 75].map((w, i) => (
                  <i key={i} className="h-1.5 rounded-full bg-fog" style={{ width: `${w}%` }} />
                ))}
              </div>
              <p className="text-[10px] text-graphite tnum">{checked !== null ? `${checked} payments` : "Ready to check"}</p>
              {running && (
                <motion.i className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-lime/60 to-transparent" initial={{ top: "-20%" }} animate={{ top: ["-20%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* the agents */}
      {AGENTS.map((a, i) => {
        const { x, y } = pos(i);
        const st = state[a.id]?.status ?? "idle";
        const info = state[a.id]?.info;
        const found = info?.findings ?? 0;
        const Icon = a.icon;
        return (
          <motion.div
            key={a.id}
            initial={{ left: "50%", top: "50%", scale: 0, opacity: 0 }}
            animate={{ left: `${x}%`, top: `${y}%`, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 15, delay: 0.25 + i * 0.07 }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <div className="flex w-[84px] flex-col items-center gap-1 text-center sm:w-[110px]">
              <div className="relative">
                {st === "running" && <span className="absolute -inset-1.5 animate-ping rounded-full bg-lime/70" />}
                <span
                  className={cn(
                    "relative flex size-12 items-center justify-center rounded-full shadow-md ring-2 transition-colors duration-500 sm:size-14",
                    st === "idle" && "bg-white text-pewter ring-white",
                    st === "running" && "bg-lime text-ink ring-lime-dark",
                    st === "done" && (found ? "bg-rose-500 text-white ring-rose-200" : "bg-leaf text-white ring-lime/60"),
                  )}
                >
                  {st === "running" ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                </span>
                <AnimatePresence>
                  {st === "done" && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-ink shadow ring-1 ring-black/10">
                      {info?.score !== undefined ? info.score : found ? found : <Check className="size-3 text-leaf" />}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <span className="text-[10px] font-semibold leading-tight text-ink sm:text-xs">{a.name}</span>
              <span className="hidden text-[10px] leading-tight text-graphite sm:block">{st === "running" ? "Checking..." : st === "done" ? (found ? `${found} found` : info?.error ? "no AI text" : "All clear") : "Waiting"}</span>
              {st === "done" && info?.model && <span className="hidden max-w-full truncate text-[9px] leading-tight text-pewter sm:block" title={`${info.model} (${info.ai})`}>{info.model.split("/").pop()}{info.backup ? " · backup" : ""}{info.ai === "error" ? " · offline" : ""}</span>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function Finding({ f, label, i }: { f: SecurityFinding; label: string; i: number }) {
  return (
    <motion.li initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.6) }} className="relative overflow-hidden rounded-2xl bg-white p-4 pl-5 shadow-sm">
      <i className={cn("absolute inset-y-0 left-0 w-1.5", SEV[f.severity].bar)} />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", SEV[f.severity].cls)}>{SEV[f.severity].label}</span>
        <span className="text-[11px] text-pewter">Found by {label}</span>
        {f.amount > 0 && <span className="ml-auto text-sm font-semibold tnum text-ink">{formatCurrency(f.amount)}</span>}
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{f.title}</p>
      <p className="mt-0.5 text-xs text-graphite">{f.detail}</p>
      {f.corroborated_by && <p className="mt-1.5 text-[11px] font-semibold text-rose-700">Also flagged by {f.corroborated_by.map((id) => AGENTS.find((a) => a.id === id)?.name ?? id).join(", ")}</p>}
      {f.web?.answer && (
        <p className="mt-1.5 rounded-lg bg-fog px-2.5 py-1.5 text-[11px] text-graphite">
          <span className="font-semibold text-ink">Web check: </span>{f.web.answer}
          {f.web.url && <> <a href={f.web.url} target="_blank" rel="noreferrer" className="text-pewter underline">source</a></>}
        </p>
      )}
      {f.ai && (
        <p className="mt-1.5 text-[11px] text-graphite">
          <span className={cn("font-semibold", f.ai.verdict === "confirm" ? "text-rose-700" : "text-leaf")}>AI {f.ai.verdict === "confirm" ? "agrees" : "doubts it"}</span>
          {f.ai.note ? `: ${f.ai.note}` : ""} <span className="text-pewter">({f.ai.model.split("/").pop()})</span>
        </p>
      )}
    </motion.li>
  );
}

export default function EvidenceRoomPage() {
  const userId = useUserId();
  const [state, setState] = useState<AgentState>({});
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.securityReport(userId);
      setReport(r);
      setState(r ? Object.fromEntries(r.agents.map((a) => [a.agent, { status: "done" as Status, info: a }])) : {});
    } catch {
      setReport(null);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [load]);

  async function run() {
    timers.current.forEach(clearTimeout);
    setRunning(true);
    setReport(null);
    setState({});
    try {
      await api.investigate(userId, (e) => {
        if (e.type === "agent") setState((s) => ({ ...s, [e.agent]: { status: e.status, info: e.status === "done" ? e : s[e.agent]?.info } }));
        else setReport(e.report);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The investigation could not run");
    } finally {
      setRunning(false);
    }
  }

  function replay() {
    if (!report) return;
    timers.current.forEach(clearTimeout);
    setRunning(true);
    setState({});
    report.agents.forEach((a, i) => {
      timers.current.push(setTimeout(() => setState((s) => ({ ...s, [a.agent]: { status: "running" } })), i * 700));
      timers.current.push(setTimeout(() => setState((s) => ({ ...s, [a.agent]: { status: "done", info: a } })), i * 700 + 600));
    });
    timers.current.push(setTimeout(() => setRunning(false), report.agents.length * 700));
  }

  async function toggleThreats() {
    setBusy(true);
    try {
      if (report?.demo_threats_present) await api.clearThreats(userId);
      else await api.plantThreats(userId);
      toast(report?.demo_threats_present ? "Demo threats removed. Run the investigation again." : "Demo threats added. Run the investigation to see them caught.");
      setReport(null);
      setState({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API .*? failed: \d+ /, "") : "Could not change demo data");
    } finally {
      setBusy(false);
    }
  }

  const label = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
  const sorted = [...(report?.findings ?? [])].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const finished = !!report && !running;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <span className="flex size-8 items-center justify-center rounded-full bg-lime">
              <ShieldAlert className="size-4" />
            </span>
            Evidence Council
          </CardTitle>
          <CardDescription>Eight agents examine your ledger one after another. Every problem links to the payment behind it, and each report is saved.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={running} className="rounded-full bg-lime text-ink hover:bg-lime/85">
            {running ? <Loader2 className="animate-spin" /> : <Play />} {report ? "Run again" : "Run investigation"}
          </Button>
          {finished && (
            <Button variant="outline" onClick={replay} className="rounded-full">
              <RotateCcw /> Replay last report
            </Button>
          )}
          <Button variant="outline" onClick={toggleThreats} disabled={busy || running} className="rounded-full">
            {report?.demo_threats_present ? <Trash2 /> : <FlaskConical />} {report?.demo_threats_present ? "Remove demo threats" : "Add demo threats"}
          </Button>
          {report && <span className="text-xs text-pewter">Last run {formatDate(report.created_at)}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dataset under test</CardTitle>
          <CardDescription>
            The council examines your own ledger: every transaction and account stored for this profile{report ? `, ${report.transactions_checked} transactions in the last run` : ""}.
            {report?.demo_threats_present ? " It currently includes clearly tagged fake suspicious transactions (demo threats) so the agents have something to catch." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/my-data" className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-4 py-2 text-sm text-ink hover:bg-fog"><Database className="size-4" /> View the dataset</Link>
          <Button size="sm" variant="outline" onClick={() => api.exportAllData(userId).catch((e) => toast(e.message))}>Download as JSON</Button>
        </CardContent>
      </Card>

      <Stage state={state} report={report} running={running} checked={report?.transactions_checked ?? null} />

      <AnimatePresence>
        {finished && report && (
          <motion.div key="result" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5">
            <Card>
              <CardContent className="grid gap-3">
                {report.verdict ? (
                  <>
                    <p className="font-display text-lg font-semibold text-ink">{report.verdict.headline}</p>
                    <p className="text-sm text-graphite">{report.verdict.what_is_wrong}</p>
                    {report.verdict.what_to_do.length > 0 && (
                      <ul className="grid gap-1.5 text-sm text-ink">
                        {report.verdict.what_to_do.map((t, i) => (
                          <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-leaf" /> {t}
                          </motion.li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-pewter">Written by FinPilot</p>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                      <AlertTriangle className="size-5 text-amber-500" /> {report.findings.length} problem(s) found
                    </p>
                    <p className="text-sm text-graphite">The AI explanation is not available right now. {report.verdict_error}</p>
                  </>
                )}
              </CardContent>
            </Card>
            {sorted.length > 0 && (
              <ul className="grid gap-3 md:grid-cols-2">
                {sorted.map((f, i) => (
                  <Finding key={`${f.agent}-${i}`} f={f} label={label(f.agent)} i={i} />
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!report && !running && (
        <p className="flex items-center gap-2 text-sm text-graphite">
          <ScanSearch className="size-4" /> No report yet. Press &quot;Run investigation&quot;. To see the agents catch something, press &quot;Add demo threats&quot; first (it adds clearly marked fake payments).
        </p>
      )}
    </motion.div>
  );
}
