"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Download, FileText, Link2, LineChart, Sheet, Unlink, Wallet, type LucideIcon } from "lucide-react";
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
import { WalletCardsIcon } from "@animateicons/react/lucide";
import { useT } from "@/components/i18nMoney";
import { LoopIcon } from "@/components/ui/LoopIcon";
import { openCreditsDrawer } from "@/components/crypto/credits/openCredits";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  bank: { icon: Banknote, tone: "bg-tint-sky text-sky" },
  invoices: { icon: FileText, tone: "bg-tint-ember text-ember-dark" },
  investments: { icon: LineChart, tone: "bg-tint-leaf text-leaf" },
  google_sheets: { icon: Sheet, tone: "bg-tint-leaf text-leaf" },
  dodo: { icon: CreditCard, tone: "bg-tint-sun text-ember-dark" },
  cake_wallet: { icon: Wallet, tone: "bg-tint-ember text-ember-dark" },
};

// Same list as the backend catalog, so every card (and the Add-a-card tile) shows at once; only the connected state waits for the API.
const CATALOG: Omit<Connector, "detail" | "connected_at">[] = [
  { id: "bank", name: "Bank accounts", description: "Balances, salary credits, loans and cards", available: true, connected: false },
  { id: "google_sheets", name: "Google Sheets", description: "A live expense sheet: edit it and the app updates", available: true, connected: false },
  { id: "invoices", name: "Gmail & Drive invoices", description: "Bills and invoices parsed automatically", available: true, connected: false },
  { id: "investments", name: "Mutual funds & stocks", description: "SIPs and holdings from your depository", available: true, connected: false },
];

// Payment rails: not data sources. Always available (test mode / testnet only); they open the credits drawer.
const RAILS: Connector[] = [
  { id: "dodo", name: "Dodo Payments", description: "Card checkout for credits. Test mode, no real charge.", available: true, connected: true, detail: "Test mode", connected_at: null },
  { id: "cake_wallet", name: "Cake Wallet", description: "Bitcoin testnet / Monero demo invoices that open as a bitcoin: or monero: link. No real money.", available: true, connected: true, detail: "Testnet", connected_at: null },
];

const CATALOG_KEYS: Record<string, [string, string]> = {
  bank: ["mc.bank", "mc.bank_d"],
  google_sheets: ["mc.sheets", "mc.sheets_d"],
  invoices: ["mc.invoices", "mc.invoices_d"],
  investments: ["mc.invest", "mc.invest_d"],
};

/** These three do not link to a real bank, Gmail/Drive or depository: Connect loads a bundled sample file. Say so on the card. */
const SAMPLE_IDS = new Set(["bank", "invoices", "investments"]);

function RailCard({ c }: { c: Connector }) {
  const { t } = useT();
  const meta = ICONS[c.id];
  return (
    <Card className="relative gap-4 overflow-hidden py-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-lime" />
      <CardContent className="grid gap-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-fog px-3">
            {meta && <meta.icon className={`size-6 ${meta.tone.split(" ")[1]}`} />}
          </div>
          <Badge className="bg-leaf/15 text-leaf hover:bg-leaf/15">{t("mc.available")}</Badge>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-pewter uppercase">{t("mc.rail")}</p>
          <h3 className="font-display text-lg font-semibold text-ink">{c.name}</h3>
          <p className="text-sm text-graphite">{c.description}</p>
          <p className="mt-1 text-xs text-pewter">{c.detail} · always available</p>
        </div>
        <Button onClick={openCreditsDrawer} className="rounded-full bg-lime text-ink hover:bg-lime/85">
          <Link2 /> {t("mc.open_credits")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Optional fields the backend may add to a connector or a connect response (code defensively: older backends omit them). */
type HonestInfo = { has_data?: boolean; message?: string | null };

function ConnectorCard({
  c,
  note,
  checking,
  onLink,
  onUnlink,
  onExport,
}: {
  c: Connector;
  /** Backend message from the last connect, shown when the link brought no data. */
  note?: string;
  checking: boolean;
  onLink: () => void;
  onUnlink: () => void;
  onExport: () => void;
}) {
  const { t } = useT();
  const meta = ICONS[c.id];
  const keys = CATALOG_KEYS[c.id];
  const sample = SAMPLE_IDS.has(c.id);
  const noData = c.connected && ((c as Connector & HonestInfo).has_data === false || Boolean(note));
  const honest = (c as Connector & HonestInfo).message || note;
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
            <Badge className={noData || sample ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-leaf/15 text-leaf hover:bg-leaf/15"}>
              {sample ? "Sample data loaded" : noData ? t("mc.connected_nodata") : t("mc.connected")}
            </Badge>
          ) : c.available ? (
            <Badge variant="outline" className={sample ? "border-amber-300 text-amber-800" : undefined}>{sample ? "Sample data only" : t("mc.ready")}</Badge>
          ) : (
            <Badge variant="secondary">{t("mc.soon")}</Badge>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{keys ? t(keys[0]) : c.name}</h3>
          <p className="text-sm text-graphite">{keys ? t(keys[1]) : c.description}</p>
          {sample && (
            <p className="mt-1 text-xs text-amber-800">
              Demo only: this does not link your real {c.id === "bank" ? "bank" : c.id === "invoices" ? "Gmail or Drive" : "holdings"}. It loads a sample file so you can see the app working. For your own data use Google Sheets or Upload document.
            </p>
          )}
          {noData && !sample && <p className="mt-1 text-xs text-amber-800">{honest || t("mc.nodata_msg")}</p>}
          {c.connected && c.connected_at && (
            <p className="mt-1 text-xs text-pewter">
              {c.detail ? `${c.detail} · ` : ""}linked {formatDate(c.connected_at)}
            </p>
          )}
        </div>
        {c.connected ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={onExport}>
              <Download /> {t("mc.export")}
            </Button>
            <Button variant="outline" className="flex-1 rounded-full" onClick={onUnlink}>
              <Unlink /> {t("mc.disconnect")}
            </Button>
          </div>
        ) : (
          <Button
            disabled={!c.available}
            onClick={onLink}
            className="rounded-full bg-lime text-ink hover:bg-lime/85 disabled:bg-fog disabled:text-pewter"
          >
            <Link2 /> {!c.available ? t("mc.soon") : sample ? "Load sample data" : t("mc.connect")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ConnectorsGrid() {
  const { data, loading, error, userId } = useConnectors();
  const { t } = useT();
  const [cardDialog, setCardDialog] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

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
    try {
      const res: HonestInfo & { transactions?: number } = await api.connectConnector(userId, c.id, "priya");
      const empty = res.has_data === false || (res.has_data === undefined && res.transactions === 0);
      if (empty) {
        const msg = res.message || "Linked, but no transactions have arrived yet.";
        setNotes((n) => ({ ...n, [c.id]: msg }));
        toast(`${c.name} connected, no transactions yet. ${msg}`);
      } else {
        toast(SAMPLE_IDS.has(c.id) ? `${c.name}: sample data loaded (demo only, not your real account).` : res.message || `${c.name} connected.`);
      }
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
          <ConnectorCard key={c.id} c={c} note={notes[c.id]} checking={checking} onLink={() => link(c)} onUnlink={() => unlink(c)} onExport={() => exportData(c)} />
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
          <span className="font-display text-lg font-semibold">{t("mc.add_card")}</span>
          <span className="text-xs text-graphite">{t("mc.add_card_sub")}</span>
        </button>
      </div>
      <AddCardDialog open={cardDialog} onOpenChange={setCardDialog} />
      <LinkSheetDialog open={sheetDialog} onOpenChange={setSheetDialog} userId={userId} />
    </>
  );
}
