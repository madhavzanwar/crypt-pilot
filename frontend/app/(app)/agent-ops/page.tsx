"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CircleCheck, CircleX, Database, Globe, KeyRound, Layers, Repeat, RotateCw, ScanSearch, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import type { OpsEvent, OpsKeyStatus, OpsOverview, OpsProbe, OpsStats } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

const short = (m?: string | null) => (m ? m.split("/").pop() : "-");
const time = (ts: string) => new Date(ts).toLocaleTimeString();

const STATUS: Record<OpsKeyStatus, { label: string; cls: string }> = {
  working: { label: "Working", cls: "bg-leaf/15 text-leaf" },
  failing: { label: "Failing", cls: "bg-rose-50 text-rose-700" },
  unused: { label: "Set, not used yet", cls: "bg-fog text-graphite" },
  not_set: { label: "Not set", cls: "bg-fog text-pewter" },
  untestable: { label: "No test available", cls: "bg-fog text-graphite" },
};
const INDEX_STATE: Record<string, string> = {
  built: "Indexed (new embeddings)",
  from_disk: "Loaded saved index from disk",
  offline_keyword_only: "Network down: keyword search only, will re-embed on next question",
  reindexed_after_outage: "Network back: re-embedded and saved",
};

function StatLine({ s }: { s: OpsStats | null | undefined }) {
  if (!s) return <span className="text-xs text-pewter">no calls yet</span>;
  return (
    <span className="text-xs text-graphite tnum">
      {s.calls} calls · <span className={s.success < 80 ? "text-rose-700" : "text-leaf"}>{s.success}% ok</span> · {s.avg_ms} ms avg{s.tokens ? ` · ${s.tokens} tokens` : ""}
    </span>
  );
}

function EventRow({ e }: { e: OpsEvent }) {
  const base = "flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-mist/60 px-3 py-2 text-xs last:border-0";
  const when = <span className="w-16 shrink-0 text-pewter tnum">{time(e.ts)}</span>;
  const run = e.run ? <span className="rounded bg-fog px-1.5 text-[10px] text-graphite">run {e.run}</span> : null;
  if (e.kind === "call")
    return (
      <li className={base}>
        {when}
        {e.ok ? <CircleCheck className="size-3.5 text-leaf" /> : <CircleX className="size-3.5 text-rose-600" />}
        <span className="font-semibold text-ink">{e.agent || "-"}</span>
        <ArrowRight className="size-3 text-pewter" />
        <span>{short(e.model)}</span>
        <span className="text-pewter">via {e.key}</span>
        <span className="ml-auto text-graphite tnum">{e.ms} ms{e.tokens ? ` · ${e.tokens} tok` : ""}{e.error ? ` · ${e.error}` : ""}</span>
        {run}
      </li>
    );
  if (e.kind === "fallback")
    return (
      <li className={cn(base, "bg-amber-50")}>
        {when}
        <Repeat className="size-3.5 text-amber-700" />
        <span className="font-semibold text-ink">{e.agent}</span>
        <span>fell back from {short(e.model)}</span><ArrowRight className="size-3" /><span>{short(e.to)}</span>
        {e.reason && <span className="text-pewter">({e.reason})</span>}
        {run}
      </li>
    );
  if (e.kind === "cache")
    return (
      <li className={base}>{when}<Database className="size-3.5 text-pewter" /><span className="font-semibold text-ink">{e.agent}</span><span>answered from cache (0 tokens)</span>{run}</li>
    );
  if (e.kind === "split")
    return (
      <li className={base}>{when}<Layers className="size-3.5 text-sky" /><span className="font-semibold text-ink">{e.agent}</span><span>{e.op}: split into {e.parts} part{e.parts === 1 ? "" : "s"}</span><span className="text-pewter">{e.detail}</span></li>
    );
  if (e.kind === "stage")
    return (
      <li className={base}>{when}<CircleCheck className="size-3.5 text-leaf" /><span className="font-semibold text-ink">{e.agent}</span><span>{e.step} done in {e.ms} ms{e.findings != null ? `, ${e.findings} finding(s)` : ""}</span>{run}</li>
    );
  if (e.kind === "index")
    return (
      <li className={cn(base, e.state === "offline_keyword_only" && "bg-amber-50")}>{when}<Database className="size-3.5 text-sky" /><span className="font-semibold text-ink">Search index</span><span>{INDEX_STATE[e.state ?? ""] ?? e.state} ({e.chunks} chunks)</span></li>
    );
  if (e.kind === "outage")
    return (
      <li className={cn(base, "bg-rose-50")}>{when}<WifiOff className="size-3.5 text-rose-700" /><span className="font-semibold text-ink">{e.provider} unreachable</span><span className="text-pewter">{e.error ?? ""}</span></li>
    );
  if (e.kind === "recovery")
    return (
      <li className={cn(base, "bg-leaf/10")}>{when}<CircleCheck className="size-3.5 text-leaf" /><span className="font-semibold text-ink">{e.provider} back online</span></li>
    );
  if (e.kind === "search")
    return (
      <li className={base}>{when}<Globe className="size-3.5 text-pewter" /><span className="font-semibold text-ink">{e.agent}</span><span>{e.op}: {e.query}</span><span className="text-pewter">{e.sites?.join(", ")}</span>{run}</li>
    );
  return <li className={base}>{when}<ScanSearch className="size-3.5 text-pewter" /><span>Investigation started</span>{run}</li>;
}

export default function AgentOpsPage() {
  const [data, setData] = useState<OpsOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, OpsProbe | "busy">>({});
  const test = useCallback(async (env: string) => {
    setProbes((p) => ({ ...p, [env]: "busy" }));
    try {
      const r = await api.opsProbe(env);
      setProbes((p) => ({ ...p, [env]: r }));
    } catch (e) {
      setProbes((p) => ({ ...p, [env]: { env, status: "failing", ms: null, detail: e instanceof Error ? e.message : "Test failed" } }));
    }
  }, []);
  const load = useCallback(() => api.opsOverview().then((d) => { setData(d); setErr(null); }).catch((e) => setErr(String(e.message ?? e))), []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="flex size-8 items-center justify-center rounded-full bg-lime"><Activity className="size-4" /></span>
              Agent Ops
            </CardTitle>
            <CardDescription>Which keys exist, which agent uses which model, what each call cost, what the web agents searched, and every retry and fallback. Refreshes every 5 seconds. Keys are shown masked.</CardDescription>
          </div>
          <Link href="/evidence-room" className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-4 py-2 text-sm text-ink hover:bg-fog sm:ml-auto">
            <ScanSearch className="size-4" /> Run Evidence Council
          </Link>
        </CardHeader>
        {err && <CardContent className="text-sm text-rose-700">{err}</CardContent>}
        {data && (
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            {[["Tokens used", data.totals.tokens], ["Fallbacks", data.totals.fallbacks], ["Cache hits (free)", data.totals.cache_hits]].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl bg-fog p-3"><p className="font-display text-2xl font-semibold tnum text-ink">{v}</p><p className="text-[11px] text-graphite">{k}</p></div>
            ))}
          </CardContent>
        )}
      </Card>

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> API keys</CardTitle>
              <CardDescription>
                {data.keys.filter((k) => k.configured).length} of {data.keys.length} set · {data.keys.filter((k) => k.status === "working").length} working · {data.keys.filter((k) => k.status === "failing").length} failing. Status comes from the latest real call; press Test to check a key now.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {data.keys.map((k) => {
                const pr = probes[k.env];
                const probe = pr && pr !== "busy" ? pr : null;
                const status = probe && probe.status !== "untestable" ? probe.status : k.status;
                return (
                  <div key={k.env} className="rounded-2xl border border-mist p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{k.provider}</span>
                      <Badge className={cn("border-0 text-[10px] hover:bg-inherit", STATUS[status].cls)}>{STATUS[status].label}</Badge>
                      <span className="ml-auto font-mono text-[11px] text-graphite">{k.masked ?? "not set"}</span>
                    </div>
                    <p className="font-mono text-[10px] text-pewter">{k.env}</p>
                    <p className="mt-1 text-xs text-graphite">{k.use}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatLine s={k.stats} />
                      {k.stats?.last_ts && <span className="text-[11px] text-pewter">last used {time(k.stats.last_ts)}</span>}
                    </div>
                    {k.stats && !k.stats.last_ok && k.stats.last_error && <p className="mt-1 text-[11px] text-rose-700">Last error: {k.stats.last_error}</p>}
                    {k.configured && (
                      <div className="mt-2 flex items-center gap-2">
                        {k.testable ? (
                          <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" disabled={pr === "busy"} onClick={() => test(k.env)}>
                            <RotateCw className={cn("size-3", pr === "busy" && "animate-spin")} /> Test now
                          </Button>
                        ) : (
                          <span className="text-[11px] text-pewter">No free test; judged from real calls</span>
                        )}
                        {probe && probe.status !== "untestable" && <span className={cn("text-[11px] tnum", probe.status === "working" ? "text-leaf" : "text-rose-700")}>{probe.detail}{probe.ms != null ? ` · ${probe.ms} ms` : ""}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Layers className="size-4" /> Request breakdown</CardTitle>
              <CardDescription>Each investigation, split into parts: one per agent, with the calls, retries and fallbacks it needed. Newest first.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {data.runs.length === 0 ? <p className="text-xs text-graphite">No runs yet. Run the Evidence Council to see one broken down here.</p> : data.runs.map((r) => (
                <details key={r.run} className="rounded-2xl border border-mist p-3 text-xs">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono font-semibold text-ink">run {r.run}</span>
                    <span className="text-pewter">{time(r.ts)} · {r.via === "inngest" ? "background job (Inngest)" : "live stream"}</span>
                    <span className="text-graphite tnum">{r.parts ?? r.stages.length} parts · {r.calls} calls · {r.tokens} tokens</span>
                    {r.errors > 0 && <span className="text-rose-700">{r.errors} failed</span>}
                    {r.fallbacks > 0 && <span className="text-amber-700">{r.fallbacks} fallback{r.fallbacks > 1 ? "s" : ""}</span>}
                    {r.cache_hits > 0 && <span className="text-leaf">{r.cache_hits} from cache</span>}
                  </summary>
                  {r.stages.length === 0 ? <p className="mt-2 text-pewter">Part timings were not recorded for this run.</p> : (
                    <ol className="mt-2 grid gap-1">
                      {r.stages.map((st, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-5 text-pewter tnum">{i + 1}.</span>
                          <span className="font-semibold text-ink">{st.agent}</span>
                          <span className="text-pewter">{st.step}</span>
                          <span className="ml-auto text-graphite tnum">{st.findings != null ? `${st.findings} finding(s) · ` : ""}{st.ms} ms</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              ))}
              {data.events.filter((e) => e.kind === "split").slice(0, 6).map((e, i) => <ul key={i} className="rounded-xl border border-mist"><EventRow e={e} /></ul>)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><WifiOff className="size-4" /> Offline, cache and recovery</CardTitle>
              <CardDescription>What each part does when the network is down, and how it catches up when it returns.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {data.resilience.providers.length === 0 ? <span className="text-xs text-graphite">No provider has been called yet.</span> : data.resilience.providers.map((p) => (
                  <Badge key={p.provider} className={cn("border-0 hover:bg-inherit", p.up ? "bg-leaf/15 text-leaf" : "bg-rose-50 text-rose-700")}>{p.provider}: {p.up ? "online" : "unreachable"}</Badge>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {data.resilience.caches.map((c) => (
                  <div key={c.name} className="rounded-2xl bg-fog p-3">
                    <p className="font-display text-xl font-semibold tnum text-ink">{c.entries}</p>
                    <p className="text-xs font-semibold text-ink">{c.name}</p>
                    <p className="text-[11px] text-graphite">{c.note}</p>
                  </div>
                ))}
              </div>
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-pewter"><tr><th className="py-1 pr-3">Part</th><th className="pr-3">When the network is down</th><th>When it comes back</th></tr></thead>
                <tbody>
                  {data.resilience.behaviour.map((b) => (
                    <tr key={b.layer} className="border-t border-mist/60 align-top">
                      <td className="py-2 pr-3 font-semibold text-ink">{b.layer}</td>
                      <td className="pr-3 text-graphite">{b.offline}</td>
                      <td className="text-graphite">{b.back}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div>
                <p className="mb-1 text-xs font-semibold text-ink">Outages, recoveries and re-indexing</p>
                {data.resilience.index_events.length === 0 ? <p className="text-xs text-graphite">None so far. They appear here the moment a provider drops or the search index is rebuilt.</p> : <ul className="rounded-xl border border-mist">{data.resilience.index_events.map((e, i) => <EventRow key={i} e={e} />)}</ul>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agents, their jobs and models</CardTitle>
              <CardDescription>Each agent has its own task prompt and model. If the model fails or times out (12 s) the backup is tried; if that fails too, the agent keeps its plain rule result.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-pewter"><tr><th className="py-1 pr-3">Agent</th><th className="pr-3">Task</th><th className="pr-3">Model → backup</th><th>Behaviour</th></tr></thead>
                <tbody>
                  {data.agents.map((a) => (
                    <tr key={a.agent} className="border-t border-mist/60 align-top">
                      <td className="py-2 pr-3 font-semibold text-ink">{a.agent}</td>
                      <td className="pr-3 text-graphite">{a.task}</td>
                      <td className="pr-3 text-graphite">{short(a.model)} <span className="text-pewter">→ {short(a.backup)}</span></td>
                      <td><StatLine s={a.stats} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Globe className="size-4" /> Web searches</CardTitle><CardDescription>What Tavily was asked and which sites it returned.</CardDescription></CardHeader>
            <CardContent>
              {data.searches.length === 0 ? <p className="text-xs text-graphite">No searches yet. Run the Evidence Council or use Web Intel.</p> : (
                <ul className="grid gap-2">
                  {data.searches.map((s, i) => (
                    <li key={i} className="rounded-xl border border-mist p-2.5 text-xs">
                      <p className="font-semibold text-ink">{s.query}</p>
                      <p className="text-graphite">{s.agent} · {s.op} · {s.results} results · {time(s.ts)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">{s.sites?.map((d) => <span key={d} className="rounded-full bg-fog px-2 py-0.5 text-[10px] text-graphite">{d}</span>)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Live activity</CardTitle><CardDescription>Newest first: calls, retries, fallbacks and cache hits.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {data.events.length === 0 ? <p className="px-6 pb-6 text-xs text-graphite">Nothing yet.</p> : <ul>{data.events.map((e, i) => <EventRow key={i} e={e} />)}</ul>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
