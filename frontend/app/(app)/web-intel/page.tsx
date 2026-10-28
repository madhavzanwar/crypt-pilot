"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Check, ExternalLink, FileText, Globe, Loader2, Map as MapIcon, Network, Search, Sparkles, Video } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { cn } from "@/lib/utils";

type Kind = "search" | "extract" | "crawl" | "map";
const MODES: { id: Kind; label: string; hint: string; placeholder: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", hint: "Ask the web a money question and get a sourced answer, e.g. is a merchant legitimate or what a scheme offers. Indian sources come first.", placeholder: "Is Quickcash Global Ltd a legitimate lender?", icon: Search },
  { id: "extract", label: "Extract", hint: "Read one page (a bank offer, a policy, a notice) as clean text.", placeholder: "https://www.rbi.org.in/…", icon: FileText },
  { id: "crawl", label: "Crawl", hint: "Follow links from a site and read the pages it contains.", placeholder: "https://www.sebi.gov.in/…", icon: Network },
  { id: "map", label: "Map", hint: "List the pages a site has, without reading them.", placeholder: "https://www.incometax.gov.in", icon: MapIcon },
];

type Row = { url: string; title: string; text: string; score?: number; favicon?: string };

const INDIAN_HOST = /\.in$|\.in\/|indiatimes\.com|moneycontrol\.com|livemint\.com|business-standard\.com|thehindu\.com|financialexpress\.com|ndtv\.com|policybazaar\.com|paisabazaar\.com|bankbazaar\.com|zerodha\.com|hdfcbank\.com|icicibank\.com|axisbank\.com|nseindia\.com|bseindia\.com|amfiindia\.com|canarahsbclife\.com|pnbmetlife\.com/;
const OFFICIAL_HOST = /\.gov\.in$|\.nic\.in$|rbi\.org\.in$|sebi\.gov\.in$|npscra\.nsdl\.co\.in$|epfindia\.gov\.in$/;

const host = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
};
const isIndian = (h: string) => INDIAN_HOST.test(h);

/** Tavily snippets are markdown with "[...]" gaps; show them as plain readable text. */
const clean = (t: string) =>
  t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\[\.\.\.\]/g, "…").replace(/^#+\s*/gm, "").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();

function toRow(r: unknown): Row {
  if (typeof r === "string") return { url: r, title: r, text: "" };
  const o = r as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const url = s(o.url);
  return { url, title: s(o.title) || host(url), text: clean(s(o.content) || s(o.raw_content)), score: typeof o.score === "number" ? o.score : undefined, favicon: s(o.favicon) || undefined };
}

function Favicon({ src, className }: { src?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={cn("flex items-center justify-center rounded-md bg-fog", className)}><Globe className="size-3.5 text-pewter" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setBad(true)} className={cn("rounded-md bg-white object-contain", className)} />;
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "india" | "official" | "muted" }) {
  const cls = { india: "bg-tint-lime text-lime-dark", official: "bg-tint-leaf text-leaf", muted: "bg-fog text-graphite" }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>{children}</span>;
}

function SourceCard({ r, n, expandable }: { r: Row; n: number; expandable: boolean }) {
  const [open, setOpen] = useState(false);
  const h = host(r.url);
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-mist bg-white p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white">{n}</span>
        <Favicon src={r.favicon} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs text-graphite">{h}</span>
        {OFFICIAL_HOST.test(h) ? <Chip tone="official"><BadgeCheck className="size-3" /> Official</Chip> : isIndian(h) && <Chip tone="india">🇮🇳 India</Chip>}
        {h.includes("youtube.com") && <Chip tone="muted"><Video className="size-3" /> Video</Chip>}
      </div>
      <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-semibold leading-snug text-ink underline-offset-2 hover:underline">{r.title}</a>
      {r.text && <p className={cn("whitespace-pre-line text-xs leading-relaxed text-graphite", !open && "line-clamp-4")}>{open ? r.text.slice(0, 4000) : r.text}</p>}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {r.score !== undefined && (
          <div className="flex items-center gap-1.5" title="How closely the page matches your question">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-fog"><div className="h-full rounded-full bg-leaf" style={{ width: `${Math.round(r.score * 100)}%` }} /></div>
            <span className="text-[10px] text-pewter tnum">{Math.round(r.score * 100)}% match</span>
          </div>
        )}
        {expandable && r.text.length > 260 && <button onClick={() => setOpen(!open)} className="text-[11px] font-medium text-graphite underline-offset-2 hover:underline">{open ? "Show less" : "Read more"}</button>}
        <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-full border border-mist px-3 py-1 text-[11px] font-medium text-ink hover:bg-fog">
          Visit <ExternalLink className="size-3" />
        </a>
      </div>
    </li>
  );
}

function AnswerCard({ answer, sources }: { answer: string; sources: Row[] }) {
  const [lead, ...points] = answer.split(/(?<=[.!?])\s+(?=[A-Z₹])/);
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-tint-lime via-white to-white ring-1 ring-mist">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-graphite"><Sparkles className="size-4 text-lime-dark" /> Answer</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="font-display text-lg leading-snug text-ink">{lead}</p>
        {points.length > 0 && (
          <ul className="grid gap-1.5">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-graphite"><Check className="mt-0.5 size-4 shrink-0 text-leaf" /> <span>{p}</span></li>
            ))}
          </ul>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-mist/70 pt-3">
            <span className="mr-1 text-[11px] text-pewter">Based on {sources.length} sources</span>
            {sources.slice(0, 6).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-2 py-1 text-[11px] text-ink hover:bg-fog">
                <Favicon src={s.favicon} className="size-3.5" /> {host(s.url)}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MapList({ rows }: { rows: Row[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{rows.length} pages found</CardTitle></CardHeader>
      <CardContent className="grid gap-1 sm:grid-cols-2">
        {rows.map((r, i) => {
          let path = r.url;
          try { const u = new URL(r.url); path = u.pathname + u.search || "/"; } catch { /* keep the raw string */ }
          return (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-fog">
              <Globe className="size-3.5 shrink-0 text-pewter" />
              <span className="min-w-0 flex-1 truncate text-ink">{path}</span>
              <ExternalLink className="size-3 shrink-0 text-pewter opacity-0 group-hover:opacity-100" />
            </a>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function WebIntelPage() {
  const [kind, setKind] = useState<Kind>("search");
  const [input, setInput] = useState("");
  const [deep, setDeep] = useState(false);
  const [indiaOnly, setIndiaOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const mode = MODES.find((m) => m.id === kind)!;

  // Indian sources first (stable, so Tavily's own ranking is kept inside each group).
  const shown = useMemo(() => {
    const ordered = [...rows].sort((a, b) => Number(isIndian(host(b.url))) - Number(isIndian(host(a.url))));
    return indiaOnly ? ordered.filter((r) => isIndian(host(r.url))) : ordered;
  }, [rows, indiaOnly]);
  const indianCount = rows.filter((r) => isIndian(host(r.url))).length;

  async function run() {
    if (!input.trim() || busy) return;
    setBusy(true), setErr(null), setAnswer(null), setRows([]), setIndiaOnly(false);
    try {
      const body: Record<string, string> = kind === "search" ? { query: input.trim(), depth: deep ? "advanced" : "basic" } : { url: input.trim() };
      const r = await api.web(kind, body);
      setAnswer(r.answer ?? null);
      setRows((r.results ?? []).map(toRow));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <span className="flex size-8 items-center justify-center rounded-full bg-lime"><Globe className="size-4" /></span>
            Web Intel
          </CardTitle>
          <CardDescription>Check things on the live web before you trust them or pay: merchants, offers, notices. Powered by Tavily.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => { setKind(m.id); setRows([]); setAnswer(null); setErr(null); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm", kind === m.id ? "border-ink bg-ink text-white" : "border-mist bg-white text-ink hover:bg-fog")}>
                <m.icon className="size-4" /> {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-graphite">{mode.hint}</p>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode.placeholder}
              className="h-10 flex-1 rounded-full border border-mist bg-white px-4 text-sm outline-none focus:border-ink" />
            <Button type="submit" disabled={busy || !input.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <mode.icon className="size-4" />} {mode.label}</Button>
          </form>
          {kind === "search" && (
            <label className="flex items-center gap-2 text-xs text-graphite">
              <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Deep search (slower, more thorough)
            </label>
          )}
        </CardContent>
      </Card>

      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}
      {answer && <AnswerCard answer={answer} sources={shown} />}

      {rows.length > 0 && kind === "map" && <MapList rows={rows} />}
      {rows.length > 0 && kind !== "map" && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base text-ink">{kind === "search" ? "Sources" : "Pages read"}</h2>
            <span className="text-xs text-pewter">{shown.length} {shown.length === 1 ? "result" : "results"}</span>
            {kind === "search" && indianCount > 0 && indianCount < rows.length && (
              <button onClick={() => setIndiaOnly(!indiaOnly)}
                className={cn("ml-auto rounded-full border px-3 py-1 text-xs", indiaOnly ? "border-ink bg-ink text-white" : "border-mist bg-white text-ink hover:bg-fog")}>
                🇮🇳 Indian sources only ({indianCount})
              </button>
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((r, i) => <SourceCard key={r.url + i} r={r} n={i + 1} expandable={kind !== "search"} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
