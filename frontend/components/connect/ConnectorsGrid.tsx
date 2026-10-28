"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Banknote, Download, Smartphone, FileText, Landmark, Link2, LineChart, Sheet, Unlink, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Connector } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { useConnectors } from "@/lib/connectors";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Card, CardContent } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { PhonePairPanel } from "@/components/dashboard/PhonePairCard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { LinkGooglePayDialog } from "@/components/connect/LinkGooglePayDialog";
import { LinkSheetDialog } from "@/components/connect/LinkSheetDialog";
import { AddCardDialog } from "@/components/connect/AddCardDialog";
import { PlaidLauncher } from "@/components/connect/PlaidLauncher";
import { WalletCardsIcon } from "@animateicons/react/lucide";
import { LoopIcon } from "@/components/ui/LoopIcon";
import { GooglePayMark } from "@/components/connect/GooglePayMark";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  bank: { icon: Banknote, tone: "bg-tint-sky text-sky" },
  invoices: { icon: FileText, tone: "bg-tint-ember text-ember-dark" },
  investments: { icon: LineChart, tone: "bg-tint-leaf text-leaf" },
  google_sheets: { icon: Sheet, tone: "bg-tint-leaf text-leaf" },
  plaid: { icon: Landmark, tone: "bg-tint-sky text-sky" },
};

// Same list as the backend catalog, so every card (and the Add-a-card tile) shows at once; only the connected state waits for the API.
const CATALOG: Omit<Connector, "detail" | "connected_at">[] = [
  { id: "google_pay", name: "Google Pay", description: "Your UPI payments, linked through your bank accounts with Account Aggregator", available: true, connected: false },
  { id: "bank", name: "Bank accounts", description: "Balances, salary credits, loans and cards", available: true, connected: false },
  { id: "google_sheets", name: "Google Sheets", description: "A live expense sheet: edit it and the app updates", available: true, connected: false },
  { id: "invoices", name: "Gmail & Drive invoices", description: "Bills and invoices parsed automatically", available: true, connected: false },
  { id: "investments", name: "Mutual funds & stocks", description: "SIPs and holdings from your depository", available: true, connected: false },
  { id: "plaid", name: "Plaid", description: "Link a US or European bank (sandbox) to import accounts and transactions", available: true, connected: false },
];

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
            {c.id === "google_pay" ? (
              <GooglePayMark className="text-lg" />
            ) : (
              meta && <meta.icon className={`size-6 ${meta.tone.split(" ")[1]}`} />
            )}
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
  const [dialog, setDialog] = useState(false);
  const [cardDialog, setCardDialog] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const [phoneDialog, setPhoneDialog] = useState(false);
  const phone = useAsync(useCallback(() => api.payPairStatus(userId), [userId]), [userId]);
  const phoneConnected = useCallback(() => {
    toast("Phone connected. Payments you make there now appear here.");
    phone.reload();
    setTimeout(() => setPhoneDialog(false), 1200); // back to the other connectors
  }, [phone]);
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
    if (c.id === "google_pay") return setDialog(true);
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
        <Card className="relative gap-4 overflow-hidden py-5">
          <CardContent className="grid gap-4 px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-fog px-3"><Smartphone className="size-6 text-sky" /></div>
              {phone.loading && !phone.data ? <Skeleton className="h-5 w-16 rounded-full" /> : phone.data?.connected ? <Badge className="bg-leaf/15 text-leaf hover:bg-leaf/15">Connected</Badge> : <Badge variant="outline">Ready</Badge>}
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">Phone payments</h3>
              <p className="text-sm text-graphite">Scan-and-pay on your phone; every payment lands here automatically.</p>
            </div>
            <Button onClick={() => setPhoneDialog(true)} className="rounded-full bg-lime text-ink hover:bg-lime/85"><Link2 /> {phone.data?.connected ? "Pair another phone" : "Connect"}</Button>
          </CardContent>
        </Card>
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
      <Dialog open={phoneDialog} onOpenChange={setPhoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect your phone</DialogTitle>
            <DialogDescription>Pairs the phone pay app with this account.</DialogDescription>
          </DialogHeader>
          <PhonePairPanel onConnected={phoneConnected} />
        </DialogContent>
      </Dialog>
      <AddCardDialog open={cardDialog} onOpenChange={setCardDialog} />
      <LinkSheetDialog open={sheetDialog} onOpenChange={setSheetDialog} userId={userId} />
      <LinkGooglePayDialog open={dialog} onOpenChange={setDialog} userId={userId} />
    </>
  );
}
