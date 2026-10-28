"use client";

import { useCallback, useMemo, useState } from "react";
import { Ban, ChevronDown, Siren, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { SecurityFinding } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import { formatCurrency } from "@/lib/format";
import { validateAddress } from "@/lib/crypto/address/validate";
import { looksLikeSecret } from "@/lib/crypto/address/seedGuard";
import { ChainChips } from "@/components/crypto/council/ChainParts";
import { postJson } from "@/components/crypto/council/stream";
import type { ChainWallet } from "@/components/crypto/council/types";
import { cn } from "@/lib/utils";

interface Merchant { id: string; label: string; amount: number; flagged: boolean; findings: string[] }
interface Category { id: string; label: string; amount: number; flagged: boolean; merchants: Merchant[] }

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-5">
        <p className="text-xs text-graphite">{label}</p>
        <p className={cn("font-display text-2xl font-semibold tnum text-ink", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Bar({ share, flagged }: { share: number; flagged?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fog">
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", flagged ? "bg-rose-400" : "bg-lime-dark/70")} style={{ width: `${Math.max(share * 100, 2)}%` }} />
    </div>
  );
}

export default function TwinSimulatorPage() {
  const userId = useUserId();
  const [months, setMonths] = useState(6);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [fraud, setFraud] = useState({ merchant: "AMAZ0N PAY", amount: "4999", wallet: "" });
  const [sim, setSim] = useState<{ caught: boolean; findings: SecurityFinding[]; merchant: string; wallet?: ChainWallet } | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const graph = useAsync(useCallback(() => api.securityGraph(userId, months), [userId, months]), [userId, months]);

  // Categories with the merchants that feed them (the old network, as an outline you can read).
  const { cats, saved, total } = useMemo(() => {
    const g = graph.data;
    if (!g) return { cats: [] as Category[], saved: 0, total: 0 };
    const merchants = new Map(g.nodes.filter((n) => n.kind === "merchant").map((n) => [n.id, n]));
    const drop = new Set(blocked.map((m) => `m:${m}`));
    const cats: Category[] = g.nodes
      .filter((n) => n.kind === "category")
      .map((c) => {
        const ms = g.edges
          .filter((e) => e.source === c.id && merchants.has(e.target) && !drop.has(e.target))
          .map((e) => ({ ...merchants.get(e.target)!, amount: e.amount }))
          .sort((a, b) => b.amount - a.amount);
        return { id: c.id, label: c.label, amount: ms.reduce((s, m) => s + m.amount, 0), flagged: ms.some((m) => m.flagged), merchants: ms };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const saved = g.nodes.filter((n) => drop.has(n.id)).reduce((s, n) => s + n.amount, 0);
    return { cats, saved, total: cats.reduce((s, c) => s + c.amount, 0) };
  }, [graph.data, blocked]);

  const all = cats.flatMap((c) => c.merchants);
  const flagged = all.filter((m) => m.flagged);
  const node = all.find((m) => m.id === picked);
  const top = cats[0]?.amount ?? 1;

  async function attempt() {
    setSimError(null);
    const amount = Math.abs(Number(fraud.amount)) || 0;
    const wallet = fraud.wallet.trim();
    if (wallet && looksLikeSecret(wallet)) {
      setFraud((f) => ({ ...f, wallet: "" }));
      setSim(null);
      setSimError("Never share your seed phrase or private key. That text was cleared and not sent.");
      return;
    }
    const checked = wallet ? validateAddress(wallet, { allowDemo: true }) : null;
    if (checked && !checked.ok) {
      setSim(null);
      setSimError("That does not look like a Bitcoin wallet address (it starts with 1, 3 or bc1).");
      return;
    }
    try {
      // Without a wallet this is the original request; with one the Chain Analyst screens it too.
      const r = checked
        ? await postJson<{ caught: boolean; findings: SecurityFinding[]; wallet?: ChainWallet }>(`/api/security/${userId}/simulate-fraud`, { merchant: fraud.merchant, amount, wallet: checked.address })
        : await api.simulateFraud(userId, fraud.merchant, amount);
      setSim({ ...r, merchant: fraud.merchant });
    } catch (err) {
      setSim(null);
      setSimError(err instanceof Error ? err.message : "Simulation failed");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Flagged merchants" value={String(flagged.length)} tone={flagged.length ? "text-rose-600" : undefined} />
        <Stat label="Money at risk" value={formatCurrency(flagged.reduce((s, m) => s + m.amount, 0))} tone={flagged.length ? "text-rose-600" : undefined} />
        <Stat label="Total spend" value={formatCurrency(total)} />
        <Stat label="Saved by blocking" value={formatCurrency(saved)} tone="text-lime-dark" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-display text-lg">Where your money flows</CardTitle>
            <CardDescription>Spending by category. Open one to see the merchants behind it. Red marks anything an agent flagged.</CardDescription>
            <label className="mt-2 flex items-center gap-3 text-xs text-graphite">
              Last {months} month{months > 1 ? "s" : ""}
              <input type="range" min={1} max={12} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="max-w-xs flex-1 accent-lime-dark" aria-label="Months of history" />
            </label>
          </CardHeader>
          <CardContent className="grid gap-1">
            {graph.loading && !graph.data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            {!graph.loading && cats.length === 0 && <p className="p-8 text-center text-sm text-graphite">No spending in this period. Connect a source on the Connect page first.</p>}
            {cats.map((c) => {
              const isOpen = open === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-transparent transition-colors hover:border-mist hover:bg-fog/40">
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="grid w-full gap-2 px-3 py-3 text-left">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{c.label}</span>
                      {c.flagged && <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-50">Flagged</Badge>}
                      <span className="ml-auto font-semibold tnum text-ink">{formatCurrency(c.amount)}</span>
                      <ChevronDown className={cn("size-4 text-pewter transition-transform duration-300", isOpen && "rotate-180")} />
                    </span>
                    <Bar share={c.amount / top} flagged={c.flagged} />
                  </button>
                  <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <ul className="min-h-0 overflow-hidden">
                      {c.merchants.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setPicked(m.id === picked ? null : m.id)}
                            className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 pl-6 text-left text-sm transition-colors hover:bg-white", m.id === picked && "bg-white shadow-sm")}
                          >
                            <span className={cn("size-2 shrink-0 rounded-full", m.flagged ? "bg-rose-400" : "bg-lime-dark/60")} />
                            <span className="min-w-0 flex-1 truncate text-ink">{m.label}</span>
                            <span className="tnum text-graphite">{formatCurrency(m.amount)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{node ? node.label : "Inspect"}</CardTitle>
              <CardDescription>{node ? `${formatCurrency(node.amount)} over ${months} month(s)` : "Pick a merchant from the list."}</CardDescription>
            </CardHeader>
            {node && (
              <CardContent className="grid gap-3 text-sm">
                {node.findings.length > 0 ? (
                  <ul className="list-disc pl-5 text-rose-700">
                    {node.findings.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                ) : (
                  <p className="text-graphite">Nothing flagged here.</p>
                )}
                {node.label !== "Other merchants" && (
                  <Button variant="outline" size="sm" onClick={() => { setBlocked((b) => [...b, node.label]); setPicked(null); }}>
                    <Ban className="size-4" /> What if I block this merchant?
                  </Button>
                )}
              </CardContent>
            )}
            {blocked.length > 0 && (
              <CardContent className="text-xs text-graphite">
                Blocked: {blocked.join(", ")}.{" "}
                <button type="button" className="inline-flex items-center gap-1 font-medium text-ink underline" onClick={() => setBlocked([])}>
                  <Undo2 className="size-3" /> Undo
                </button>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Siren className="size-4 text-rose-500" /> Simulate a fraud attempt
              </CardTitle>
              <CardDescription>Nothing is saved. The agents check your ledger plus this one made-up payment.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Input value={fraud.merchant} onChange={(e) => setFraud({ ...fraud, merchant: e.target.value })} aria-label="Merchant name" />
              <Input value={fraud.amount} inputMode="numeric" onChange={(e) => setFraud({ ...fraud, amount: e.target.value })} aria-label="Amount in rupees" />
              <Input value={fraud.wallet} onChange={(e) => setFraud({ ...fraud, wallet: e.target.value })} placeholder="Paying a crypto wallet? Paste its address (optional)" aria-label="Crypto wallet address (optional)" className="font-mono text-xs" autoComplete="off" spellCheck={false} />
              <Button size="sm" onClick={attempt}>Run the agents</Button>
              {simError && <p className="text-xs text-rose-700">{simError}</p>}
              {sim && (
                <div className={cn("rounded-xl p-3 text-xs", sim.caught ? "bg-rose-50 text-rose-800" : "bg-tint-lime text-ink")}>
                  <p className="font-semibold">{sim.caught ? `Caught: ${sim.findings.length} flag(s) for ${sim.merchant}` : `Not flagged: ${sim.merchant} looks normal to the agents.`}</p>
                  {sim.findings.map((f, i) => <p key={i} className="mt-1">{f.title}</p>)}
                  {sim.wallet && (
                    <div className="mt-2 grid gap-1 border-t border-black/10 pt-2 text-ink">
                      <p className="font-semibold">Chain Analyst</p>
                      <ChainChips w={sim.wallet} />
                      <p>{sim.wallet.reason}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
