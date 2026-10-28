"use client";

import { useState } from "react";
import { Landmark, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { SchemeAnalysis } from "@/lib/types";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";

const QUICK = ["PM Jan Dhan Yojana", "Atal Pension Yojana", "Sukanya Samriddhi Yojana", "National Pension System", "Senior Citizen Savings Scheme", "PM Jeevan Jyoti Bima Yojana", "Sovereign Gold Bonds"];
const SECTIONS = [
  ["eligibility", "Who can join"],
  ["benefits", "What you get"],
  ["how_to_apply", "How to apply"],
  ["deadlines", "Dates and limits"],
  ["watch_out", "Watch out"],
] as const;

export default function SchemeAnalystPage() {
  const [scheme, setScheme] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<SchemeAnalysis | null>(null);

  async function run(name = scheme) {
    if (name.trim().length < 2 || busy) return;
    setScheme(name), setBusy(true), setErr(null), setOut(null);
    try {
      setOut(await api.schemeAnalyst(name.trim(), question.trim()));
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
            <span className="flex size-8 items-center justify-center rounded-full bg-lime"><Landmark className="size-4" /></span>
            Scheme Analyst
          </CardTitle>
          <CardDescription>A deep search of official government sites, written up in plain language with the source for every fact. Always confirm on the official page before you apply.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q} onClick={() => run(q)} className="rounded-full border border-mist bg-white px-3 py-1.5 text-xs text-ink hover:bg-fog">{q}</button>
            ))}
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <input value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="Scheme name" className="h-10 rounded-full border border-mist bg-white px-4 text-sm outline-none focus:border-ink" />
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Your question (optional), e.g. am I eligible at age 45?" className="h-10 rounded-full border border-mist bg-white px-4 text-sm outline-none focus:border-ink" />
            <Button type="submit" disabled={busy || scheme.trim().length < 2}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Analyse</Button>
          </form>
          {busy && <p className="text-xs text-graphite">Reading official sources, this takes about 20 seconds…</p>}
        </CardContent>
      </Card>

      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}
      {out?.note && <p className="rounded-xl bg-fog px-4 py-3 text-sm text-graphite">{out.note}</p>}
      {out?.brief && (
        <>
          <Card><CardContent className="pt-5 text-sm text-ink">{out.brief.summary}</CardContent></Card>
          <div className="grid gap-4 md:grid-cols-2">
            {SECTIONS.map(([k, label]) => out.brief![k]?.length > 0 && (
              <Card key={k}>
                <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
                <CardContent><ul className="grid list-disc gap-1.5 pl-5 text-sm text-graphite">{out.brief![k].map((x, i) => <li key={i}>{x}</li>)}</ul></CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {out && !out.brief && out.answer && <Card><CardContent className="pt-5 text-sm text-ink">{out.answer}</CardContent></Card>}
      {out && out.sources.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Official sources</CardTitle></CardHeader>
          <CardContent><ol className="grid gap-1 text-xs">
            {out.sources.map((s) => <li key={s.n}>[{s.n}] <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-ink underline-offset-2 hover:underline">{s.title}</a></li>)}
          </ol></CardContent>
        </Card>
      )}
    </div>
  );
}
