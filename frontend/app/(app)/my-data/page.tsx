"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Database, Download, Eye, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { DataSource } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";

function Preview({ rows }: { rows: unknown[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-1 rounded-xl bg-fog/60 p-2 text-[11px] text-graphite">
      {rows.map((r, i) => (
        <li key={i} className="truncate font-mono">
          {Object.values(r as Record<string, unknown>).join(" · ")}
        </li>
      ))}
    </ul>
  );
}

export default function MyDataPage() {
  const userId = useUserId();
  const { data, loading, error, reload } = useAsync(useCallback(() => api.myData(userId), [userId]), [userId]);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportOne(s: DataSource) {
    setMsg(null);
    try {
      await (s.id === "ledger" ? api.exportAllData(userId) : api.exportConnector(userId, s.id));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function disconnect(s: DataSource) {
    if (!window.confirm(`Disconnect ${s.name}? Its data will be removed from FinPilot.`)) return;
    setMsg(null);
    try {
      await api.disconnectConnector(userId, s.id);
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Disconnect failed");
    }
  }

  return (
    <div className="grid gap-4">
      <h1 className="sr-only">My data</h1>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="flex size-8 items-center justify-center rounded-full bg-lime">
                <Database className="size-4" />
              </span>
              My Data
            </CardTitle>
            <CardDescription>Everything FinPilot holds about you, in one place. View it, download it, or disconnect a source.</CardDescription>
          </div>
          <Button size="sm" className="sm:ml-auto" onClick={() => api.exportAllData(userId).catch((e) => setMsg(e.message))}>
            <Download className="size-4" /> Export everything
          </Button>
        </CardHeader>
        {(msg || error) && <CardContent className="text-sm text-red-700">{msg ?? String(error)}</CardContent>}
      </Card>

      {loading && <p className="text-sm text-graphite">Loading your data…</p>}
      {data && data.sources.length === 0 && <p className="text-sm text-graphite">No data sources are connected yet. Connect one on the Connect page.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.sources.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
          <Card className="h-full bg-gradient-to-br from-white to-tint-lime/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="size-2 rounded-full bg-leaf" /> {s.name}
              </CardTitle>
              <CardDescription>
                {s.records.toLocaleString()} records{s.detail ? ` · ${s.detail}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Preview rows={s.preview} />
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportOne(s)}>
                  <Download className="size-4" /> Export
                </Button>
                {s.disconnectable && (
                  <Button variant="ghost" size="sm" onClick={() => disconnect(s)}>
                    <Unplug className="size-4" /> Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access log</CardTitle>
          <CardDescription>The latest times your data was read, exported or changed.</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.access_log.length === 0 && <p className="text-sm text-graphite">Nothing recorded yet.</p>}
          <ul className="divide-y divide-mist text-sm">
            {data?.access_log.map((a, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.5) }} className="flex flex-wrap items-center gap-x-3 py-2.5">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${a.event === "data_access" ? "bg-tint-lime text-olive" : "bg-fog text-graphite"}`}>
                  {a.event === "data_access" ? <Eye className="size-3.5" /> : <Activity className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{a.detail || `${a.method} ${a.path}`}</span>
                <time className="text-xs text-graphite tnum">{new Date(a.when).toLocaleString()}</time>
              </motion.li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
