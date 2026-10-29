"use client";

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

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-pewter">{label}</p>
      <div className="flex items-center gap-2 rounded-surface border border-mist bg-fog py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={value} translate="no" lang="en">
          {value}
        </code>
        <Button type="button" variant="outline" size="xs" onClick={() => void copy(value, label)} aria-label={`Copy ${label}`}>
          <Copy /> Copy
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
  const s = STATUS[status];
  const Icon = s.icon;
  const live = status === "waiting";
  const isBtc = invoice.coin === "btc";
  return (
    <div className="grid gap-4 rounded-surface border border-mist bg-white p-4">
      <p className="text-sm font-semibold text-ink">
        Send <span className="tabular-nums">{invoice.amount}</span> {invoice.coin.toUpperCase()}{" "}
        <span className="font-normal text-graphite">{isBtc ? "(Bitcoin testnet, worthless test coins)" : "(Monero demo, no real XMR)"}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.cls)}>
          <Icon className="size-3.5" aria-hidden /> {s.label}
        </span>
        {live && <span className="text-xs text-graphite tabular-nums">Expires in {formatCountdown(remaining)}</span>}
      </div>

      <div className={cn("mx-auto w-fit rounded-surface border border-mist bg-white p-3 text-ink transition-opacity", !live && "opacity-30")}>
        <div role="img" aria-label={`QR code for the ${invoice.coin.toUpperCase()} payment link`}>
          <QRCodeSVG value={invoice.uri} size={176} level="M" marginSize={0} bgColor="transparent" fgColor="currentColor" />
        </div>
      </div>

      {live && (
        <Button asChild variant="lime" size="lg" className="w-full">
          <a href={invoice.uri}>
            <ExternalLink /> Open in Cake Wallet
          </a>
        </Button>
      )}
      <p className="-mt-2 text-center text-xs text-pewter">
        This opens the <code className="font-mono" translate="no" lang="en">{isBtc ? "bitcoin:" : "monero:"}</code> link in whichever wallet your device uses, such as Cake Wallet.
      </p>

      <div className="grid gap-3">
        <CopyRow label="Amount" value={invoice.amount} />
        <CopyRow label="Address" value={invoice.address} />
        <CopyRow label="Payment link" value={invoice.uri} />
      </div>

      {invoice.provider === "demo" && (
        <p className="text-xs text-graphite">Monero payments are a demo here: they are not confirmed automatically, so the balance will not change by itself.</p>
      )}

      {!live && (
        <Button type="button" variant="outline" onClick={onNew}>
          Create a new invoice
        </Button>
      )}
    </div>
  );
}
