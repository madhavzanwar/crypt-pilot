"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/crypto/api";
import type { CreditPack, CryptoCoin, CryptoInvoice as Invoice, InvoiceState } from "@/lib/crypto/api";
import { notifyCreditsChanged } from "@/lib/crypto/creditsEvents";
import { toRequestLang } from "@/lib/crypto/lang";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { InvoiceCard } from "./InvoiceCard";

const POLL_MS = 10_000;

const COINS: { id: CryptoCoin; label: string }[] = [
  { id: "btc", label: "Bitcoin (testnet)" },
  { id: "xmr", label: "Monero (demo)" },
];

/** Seconds until `expiresAt`, ticking once a second while an invoice is live. */
function useRemaining(expiresAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick); // refresh straight away when a hidden tab returns
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [expiresAt]);
  if (!expiresAt) return 0;
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) ? Math.max(0, Math.round((end - now) / 1000)) : 0;
}

/** "Cake Wallet (BTC testnet / XMR demo)": mount with key={pack.id} so a different pack starts clean. Create an invoice, show QR + deep link, poll its status every 10 s until paid or expired. */
export function CryptoInvoice({ pack }: { pack: CreditPack }) {
  const { lang } = useT();
  const [coin, setCoin] = useState<CryptoCoin>("btc");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [apiStatus, setApiStatus] = useState<InvoiceState>("waiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const celebrated = useRef<string | null>(null);

  const remaining = useRemaining(invoice?.expiresAt);
  // The server decides when an invoice is expired or paid (BUG-071): the client clock only drives the countdown, so a
  // tab with a wrong or sleeping clock can neither declare "expired" early nor stop polling for a payment.
  const status: InvoiceState = apiStatus;

  const invoiceId = invoice?.invoiceId;
  useEffect(() => {
    if (!invoiceId || apiStatus !== "waiting") return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await api.invoiceStatus(invoiceId);
        if (!stop) setApiStatus(r.status);
      } catch {
        /* keep waiting: the next tick retries */
      }
    };
    const id = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll(); // a sleeping tab catches up as soon as it wakes
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [invoiceId, apiStatus]);

  useEffect(() => {
    if (status !== "paid" || !invoiceId || celebrated.current === invoiceId) return;
    celebrated.current = invoiceId;
    notifyCreditsChanged();
    toast.success(`Payment received. ${pack.credits} credits added (testnet).`);
  }, [status, invoiceId, pack.credits]);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const inv = await api.createInvoice(pack.id, coin);
      setApiStatus("waiting");
      setInvoice(inv);
    } catch (e) {
      setError(messageFor(e, toRequestLang(lang)).message);
    } finally {
      setBusy(false);
    }
  }, [pack.id, coin, lang]);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-graphite">
        Pays with test coins only. Cake Wallet (or any wallet that handles <code className="font-mono" translate="no" lang="en">bitcoin:</code> / <code className="font-mono" translate="no" lang="en">monero:</code> links) can open the invoice.
      </p>
      <div role="radiogroup" aria-label="Coin" className="grid grid-cols-2 gap-2">
        {COINS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={coin === c.id}
            onClick={() => {
              setCoin(c.id);
              setInvoice(null);
              setApiStatus("waiting");
              setError(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              coin === c.id ? "border-lime-dark bg-lime text-ink" : "border-mist bg-white text-graphite hover:bg-fog",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-surface bg-rose-badge/10 px-3 py-2 text-sm text-rose-badge">
          {error}
        </p>
      )}

      {invoice ? (
        <InvoiceCard invoice={invoice} status={status} remaining={remaining} onNew={() => { setInvoice(null); setApiStatus("waiting"); }} />
      ) : (
        <Button variant="lime" size="lg" onClick={() => void create()} disabled={busy} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <QrCode />} Create {coin === "btc" ? "testnet" : "demo"} invoice
        </Button>
      )}
    </div>
  );
}
