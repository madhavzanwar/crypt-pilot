"use client";

import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { CouncilEvent, CouncilVerdict, CouncilVote } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import WalletsInput from "@/components/crypto/council/WalletsInput";
import { AddWalletInvite, GraphEvidence, UnverifiedCaveat, WalletList, firstScreened } from "@/components/crypto/council/ChainParts";
import { postNdjson } from "@/components/crypto/council/stream";
import { useWalletList } from "@/components/crypto/council/useWallets";
import { isChainVote, type ChainVote } from "@/components/crypto/council/types";

const tone: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-100 text-rose-800",
  abstain: "bg-fog text-graphite",
};

function Badge({ level, children }: { level: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone[level] ?? ""}`}>{children}</span>;
}

export default function CouncilPage() {
  const userId = useUserId();
  const [wallets, setWallets] = useWalletList(userId);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const [votes, setVotes] = useState<(CouncilVote | ChainVote)[]>([]);
  const [debate, setDebate] = useState<string[] | null>(null);
  const [verdict, setVerdict] = useState<CouncilVerdict | null>(null);
  const lang = useLang();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convene() {
    setVotes([]);
    setDebate(null);
    setVerdict(null);
    setError(null);
    setRunning(true);
    try {
      const onEvent = (e: CouncilEvent) => {
        if (e.type === "vote") setVotes((v) => [...v.filter((x) => x.agent !== e.vote.agent), e.vote]);
        else if (e.type === "debate") setDebate(e.agents);
        else if (e.type === "verdict") {
          setVerdict(e);
          setVotes(e.votes);
        }
      };
      // With no wallets this is the original request; with wallets the Chain Analyst joins as an extra specialist.
      if (wallets.length === 0) await api.convene(userId, onEvent);
      else await postNdjson<CouncilEvent>(`/api/security/${userId}/council`, { wallets, lang }, onEvent, "Council failed", (abortRef.current = new AbortController()).signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "The council could not convene");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Risk Council</h1>
        <p className="mt-1 text-sm text-graphite">
          Seven AI specialists read a short summary of your finances (never your raw transactions), vote on your risk, and argue when they disagree.
          List crypto wallets below and an eighth, the Chain Analyst, adds graph evidence.
        </p>
      </div>

      <Card>
        <WalletsInput wallets={wallets} onChange={setWallets} disabled={running} />
      </Card>

      <Button variant="lime" onClick={convene} disabled={running}>
        <Users className="size-4" /> {running ? "The council is deliberating…" : verdict ? "Convene again" : "Convene the council"}
      </Button>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      {verdict && (
        <Card>
          <CardHeader>
            <CardTitle>Verdict</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 p-5 pt-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="tnum font-display text-4xl text-ink">{verdict.score}</span>
              <Badge level={verdict.level}>{verdict.level} risk</Badge>
              <span className="text-xs text-pewter">
                {Object.entries(verdict.counts).map(([l, n]) => `${n} ${l}`).join(" · ")}
                {verdict.cached ? " · cached" : verdict.tokens ? ` · ${verdict.tokens} tokens` : " · rule-based, no model used"}
              </span>
            </div>
            <UnverifiedCaveat count={verdict.unverified} caveat={verdict.caveat} />
            {verdict.actions.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-ink">
                {verdict.actions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            {verdict.dissent.length > 0 && (
              <p className="text-sm text-graphite">
                Dissent: {verdict.dissent.map((d) => `${d.name} (${d.level})`).join(", ")}
              </p>
            )}
          </div>
        </Card>
      )}

      {debate && !verdict && <p className="text-sm text-graphite">Some agents disagree sharply, so they get a second turn…</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {votes.map((v) => isChainVote(v) ? (
          <Card key={v.agent} className="sm:col-span-2">
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{v.name}</span>
                <Badge level={v.level}>{v.abstain ? "Abstains" : v.score}</Badge>
              </div>
              <p className="text-sm text-graphite">{v.why}</p>
              {v.chain.wallets.length > 0 && <WalletList wallets={v.chain.wallets} />}
              {v.do && <p className="text-xs text-ink">Do: {v.do}</p>}
              <p className="text-xs text-pewter">Graph evidence, no model{v.abstain ? " · not counted in the vote" : ""}</p>
            </div>
          </Card>
        ) : (
          <Card key={v.agent}>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{v.name}</span>
                <Badge level={v.level}>{v.score}</Badge>
              </div>
              <p className="text-sm text-graphite">{v.why}</p>
              {v.do && <p className="text-xs text-ink">Do: {v.do}</p>}
              <p className="text-xs text-pewter">
                {v.source === "model" ? "Nemotron" : "Rule-based"}
                {v.round === 2 ? " · changed after debate" : ""}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {wallets.length === 0 && (verdict || votes.length > 0) && <AddWalletInvite />}
      {(() => {
        const cv = votes.find(isChainVote);
        return cv ? <GraphEvidence address={firstScreened(cv.chain.wallets, wallets)} /> : null;
      })()}
    </div>
  );
}
