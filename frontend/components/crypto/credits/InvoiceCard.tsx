"use client";

import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { CircleCheck, Clock, Copy, ExternalLink, TimerOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import type { CryptoInvoice, InvoiceState } from "@/lib/crypto/api";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function copy(text: string, what: string, t: (k: string, f?: string) => string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} ${t("cr.inv.copied", "copied")}`);
  } catch {
    toast.error(t("cr.inv.copyFail", "Could not copy. Select the text and copy it by hand."));
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-pewter">{label}</p>
      <div className="flex items-center gap-2 rounded-surface border border-mist bg-fog py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={value} translate="no" lang="en">
          {value}
        </code>
        <Button type="button" variant="outline" size="xs" onClick={() => void copy(value, label, t)} aria-label={`${t("cr.inv.copy", "Copy")} ${label}`}>
          <Copy /> {t("cr.inv.copy", "Copy")}
        </Button>
      </div>
    </div>
  );
}

const STATUS = {
  waiting: { label: "Waiting for payment", icon: Clock, cls: "bg-tint-sun text-ember-dark" },
  paid: { label: "Paid, credits added", icon: CircleCheck, cls: "bg-leaf/15 text-leaf" },
  expired: { label: "Expired", icon: TimerOff, cls: "bg-fog text-graphite" },
} as const;

/** Presentational invoice: QR of the payment URI, amount, address, "Open in Cake Wallet", countdown and status. Polling lives in CryptoInvoice. */
export function InvoiceCard({
  invoice,
  status,
  remaining,
  onNew,
}: {
  invoice: CryptoInvoice;
  status: InvoiceState;
  remaining: number;
  onNew: () => void;
}) {
  const { t } = useT();
  const s = STATUS[status];
  const Icon = s.icon;
  const live = status === "waiting";
  const isBtc = invoice.coin === "btc";
  return (
    <div className="grid gap-4 rounded-surface border border-mist bg-white p-4">
      <p className="text-sm font-semibold text-ink">
        {t("cr.inv.send", "Send")} <span className="tabular-nums">{invoice.amount}</span> {invoice.coin.toUpperCase()}{" "}
        <span className="font-normal text-graphite">{isBtc ? t("cr.inv.btcNote", "(Bitcoin testnet, worthless test coins)") : t("cr.inv.xmrNote", "(Monero demo, no real XMR)")}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.cls)}>
          <Icon className="size-3.5" aria-hidden /> {t(`cr.inv.status.${status}`, s.label)}
        </span>
        {live && <span className="text-xs text-graphite tabular-nums">{t("cr.inv.expires", "Expires in")} {formatCountdown(remaining)}</span>}
      </div>

      <div className={cn("mx-auto w-fit rounded-surface border border-mist bg-white p-3 text-ink transition-opacity", !live && "opacity-30")}>
        <div role="img" aria-label={`${t("cr.inv.qr", "QR code for the payment link")} (${invoice.coin.toUpperCase()})`}>
          <QRCodeSVG value={invoice.uri} size={176} level="M" marginSize={0} bgColor="transparent" fgColor="currentColor" />
        </div>
      </div>

      {live && (
        <Button asChild variant="lime" size="lg" className="w-full">
          <a href={invoice.uri}>
            <ExternalLink /> {t("cr.inv.open", "Open in Cake Wallet")}
          </a>
        </Button>
      )}
      <p className="-mt-2 text-center text-xs text-pewter">
        {t("cr.inv.opensPre", "This opens the")} <code className="font-mono" translate="no" lang="en">{isBtc ? "bitcoin:" : "monero:"}</code> {t("cr.inv.opensPost", "link in whichever wallet your device uses, such as Cake Wallet.")}
      </p>

      <div className="grid gap-3">
        <CopyRow label={t("cr.inv.amount", "Amount")} value={invoice.amount} />
        <CopyRow label={t("cr.inv.address", "Address")} value={invoice.address} />
        <CopyRow label={t("cr.inv.link", "Payment link")} value={invoice.uri} />
      </div>

      {invoice.provider === "demo" && (
        <p className="text-xs text-graphite">{t("cr.inv.xmrDemo", "Monero payments are a demo here: they are not confirmed automatically, so the balance will not change by itself.")}</p>
      )}

      {!live && (
        <Button type="button" variant="outline" onClick={onNew}>
          {t("cr.inv.new", "Create a new invoice")}
        </Button>
      )}
    </div>
  );
}
