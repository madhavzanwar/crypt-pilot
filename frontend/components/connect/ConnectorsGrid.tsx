"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Download, FileText, Landmark, Link2, LineChart, Sheet, Unlink, Wallet, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Connector } from "@/lib/types";
import { useConnectors } from "@/lib/connectors";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Card, CardContent } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { LinkSheetDialog } from "@/components/connect/LinkSheetDialog";
import { AddCardDialog } from "@/components/connect/AddCardDialog";
import { PlaidLauncher } from "@/components/connect/PlaidLauncher";
import { WalletCardsIcon } from "@animateicons/react/lucide";
import { LoopIcon } from "@/components/ui/LoopIcon";
import { openCreditsDrawer } from "@/components/crypto/credits/openCredits";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  bank: { icon: Banknote, tone: "bg-tint-sky text-sky" },
  invoices: { icon: FileText, tone: "bg-tint-ember text-ember-dark" },
  investments: { icon: LineChart, tone: "bg-tint-leaf text-leaf" },
  google_sheets: { icon: Sheet, tone: "bg-tint-leaf text-leaf" },
  plaid: { icon: Landmark, tone: "bg-tint-sky text-sky" },
  dodo: { icon: CreditCard, tone: "bg-tint-sun text-ember-dark" },
  cake_wallet: { icon: Wallet, tone: "bg-tint-ember text-ember-dark" },
};

// Same list as the backend catalog, so every card (and the Add-a-card tile) shows at once; only the connected state waits for the API.
const CATALOG: Omit<Connector, "detail" | "connected_at">[] = [
  { id: "bank", name: "Bank accounts", description: "Balances, salary credits, loans and cards", available: true, connected: false },
  { id: "google_sheets", name: "Google Sheets", description: "A live expense sheet: edit it and the app updates", available: true, connected: false },
  { id: "invoices", name: "Gmail & Drive invoices", description: "Bills and invoices parsed automatically", available: true, connected: false },
  { id: "investments", name: "Mutual funds & stocks", description: "SIPs and holdings from your depository", available: true, connected: false },
  { id: "plaid", name: "Plaid", description: "Link a US or European bank (sandbox) to import accounts and transactions", available: true, connected: false },
];

// Payment rails: not data sources. Always available (test mode / testnet only); they open the credits drawer.
const RAILS: Connector[] = [
  { id: "dodo", name: "Dodo Payments", description: "Card checkout for credits. Test mode, no real charge.", available: true, connected: true, detail: "Test mode", connected_at: null },
  { id: "cake_wallet", name: "Cake Wallet", description: "Bitcoin testnet / Monero demo invoices that open as a bitcoin: or monero: link. No real money.", available: true, connected: true, detail: "Testnet", connected_at: null },
];

function RailCard({ c }: { c: Connector }) {
  const meta = ICONS[c.id];
  return (
    <Card className="relative gap-4 overflow-hidden py-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-lime" />
      <CardContent className="grid gap-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-fog px-3">
            {meta && <meta.icon className={`size-6 ${meta.tone.split(" ")[1]}`} />}
          </div>
          <Badge className="bg-leaf/15 text-leaf hover:bg-leaf/15">Available</Badge>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-pewter uppercase">Payment rail</p>
          <h3 className="font-display text-lg font-semibold text-ink">{c.name}</h3>
          <p className="text-sm text-graphite">{c.description}</p>
          <p className="mt-1 text-xs text-pewter">{c.detail} · always available</p>
        </div>
        <Button onClick={openCreditsDrawer} className="rounded-full bg-lime text-ink hover:bg-lime/85">
          <Link2 /> Open credits
        </Button>
      </CardContent>
    </Card>
  );
}

function ConnectorCard({
  c,
  checking,
  onLink,
  onUnlink,
  onExport,
}: {
  c: Connector;
  checking: boolean;
  onLink: () => void;
  onUnlink: () => void;
  onExport: () => void;
}) {
  const meta = ICONS[c.id];
  return (
    <Card className="relative gap-4 overflow-hidden py-5">
      {c.connected && <div className="absolute inset-x-0 top-0 h-1 bg-lime" />}
      <CardContent className="grid gap-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-fog px-3">
            {meta && <meta.icon className={`size-6 ${meta.tone.split(" ")[1]}`} />}
          </div>
          {checking ? (
            <Skeleton className="h-5 w-16 rounded-full" />
          ) : c.connected ? (
            <Badge className="bg-leaf/15 text-leaf hover:bg-leaf/15">Connected</Badge>
          ) : c.available ? (
            <Badge variant="outline">Ready</Badge>
          ) : (
            <Badge variant="secondary">Coming soon</Badge>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{c.name}</h3>
          <p className="text-sm text-graphite">{c.description}</p>
          {c.connected && c.connected_at && (
            <p className="mt-1 text-xs text-pewter">
              {c.detail ? `${c.detail} · ` : ""}linked {formatDate(c.connected_at)}
            </p>
          )}
        </div>
        {c.connected ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={onExport}>
              <Download /> Export
            </Button>
            <Button variant="outline" className="flex-1 rounded-full" onClick={onUnlink}>
              <Unlink /> Disconnect
            </Button>
          </div>
        ) : (
          <Button
            disabled={!c.available}
            onClick={onLink}
            className="rounded-full bg-lime text-ink hover:bg-lime/85 disabled:bg-fog disabled:text-pewter"
          >
            <Link2 /> {c.available ? "Connect" : "Coming soon"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ConnectorsGrid() {
  const { data, loading, error, userId } = useConnectors();
  const [cardDialog, setCardDialog] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const [plaidToken, setPlaidToken] = useState("");

  async function unlink(c: Connector) {
    try {
      await api.disconnectConnector(userId, c.id);
      toast(`${c.name} disconnected. Imported data was removed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    }
  }

  async function link(c: Connector) {
    if (c.id === "google_sheets") return setSheetDialog(true);
    if (c.id === "plaid") {
      try {
        setPlaidToken((await api.plaidLinkToken(userId)).link_token);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start Plaid");
      }
      return;
    }
    try {
      await api.connectConnector(userId, c.id, "priya");
      toast(`${c.name} connected.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect");
    }
  }

  async function exportData(c: Connector) {
    try {
      await api.exportConnector(userId, c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export");
    }
  }

  const checking = loading && !data;
  const items: Connector[] = CATALOG.map((c) => data?.find((d) => d.id === c.id) ?? { ...c, detail: null, connected_at: null });

  return (
    <>
      {error && <p className="mb-3 text-sm text-rose-badge">Could not check which sources are linked: {error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((c) => (
          <ConnectorCard key={c.id} c={c} checking={checking} onLink={() => link(c)} onUnlink={() => unlink(c)} onExport={() => exportData(c)} />
        ))}
        {RAILS.map((c) => (
          <RailCard key={c.id} c={c} />
        ))}
        <button
          type="button"
          onClick={() => setCardDialog(true)}
          className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-lime-dark/60 bg-tint-lime p-5 text-ink transition hover:bg-lime/40"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-lime">
            <LoopIcon icon={WalletCardsIcon} size={28} />
          </span>
          <span className="font-display text-lg font-semibold">Add a card</span>
          <span className="text-xs text-graphite">Credit or debit, demo only</span>
        </button>
      </div>
      {plaidToken && <PlaidLauncher token={plaidToken} userId={userId} onClose={() => setPlaidToken("")} />}
      <AddCardDialog open={cardDialog} onOpenChange={setCardDialog} />
      <LinkSheetDialog open={sheetDialog} onOpenChange={setSheetDialog} userId={userId} />
    </>
  );
}
