"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";

/** Body of the phone-pairing flow: mints a code and shows the link and QR that open the phone app on this account. */
export function PhonePairPanel({ onConnected }: { onConnected?: () => void }) {
  const userId = useUserId();
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [paired, setPaired] = useState(false);

  // Once the phone opens the link, drop the QR and tell the parent so it can move on to the other connectors.
  useEffect(() => {
    if (!code || paired) return;
    const id = setInterval(() => {
      api.payPairStatus(userId, code).then((s) => {
        if (!s.claimed) return;
        setPaired(true);
        onConnected?.();
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [code, paired, userId, onConnected]);

  async function connect() {
    setError("");
    try {
      const { code } = await api.payPair(userId);
      setCode(code);
      const url = `${window.location.origin}/pay?u=${encodeURIComponent(userId)}&pair=${encodeURIComponent(code)}`;
      setLink(url);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a pairing link");
    }
  }

  if (paired) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-leaf">
        <CheckCircle2 className="size-5" /> Phone connected. Payments you make there now appear here.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-graphite">Connect the FinPilot Pay phone app to this account. Every payment you make on the phone is saved here, analysed and shown in your transactions within a second.</p>
        {link && <p className="mt-2 break-all text-xs text-pewter">Open this on the phone (scan the code or type it): {link}</p>}
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL
        <img src={qr} alt="Pairing QR code for the phone app" className="size-[140px] rounded-lg border border-black/[0.06]" />
      ) : (
        <Button size="sm" onClick={connect}>Connect phone</Button>
      )}
    </div>
  );
}

/** Dashboard card for the same flow; the full list of sources is on /connect. */
export function PhonePairCard() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium text-ink">
            <span className="flex size-9 items-center justify-center rounded-full bg-sage"><Smartphone className="size-5" /></span>
            Phone payments
          </h2>
          <Link href="/connect" className="text-xs text-graphite underline">All connectors</Link>
        </div>
        <PhonePairPanel />
      </CardContent>
    </Card>
  );
}
