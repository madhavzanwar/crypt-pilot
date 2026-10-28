"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";

/** Dashboard tile: paste a Bitcoin address and jump to Wallet Guard with it pre-filled. */
export function WalletGuardTile() {
  const { t } = useT();
  const router = useRouter();
  const [address, setAddress] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const a = address.trim();
    router.push(a ? `/wallet-guard?address=${encodeURIComponent(a)}` : "/wallet-guard");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium text-ink">
            <span className="flex size-9 items-center justify-center rounded-full bg-sage"><ShieldCheck className="size-5" /></span>
            {t("nav.Wallet Guard", "Wallet Guard")}
          </h2>
          <Link href="/wallet-guard" className="inline-flex items-center gap-1 text-xs text-graphite underline">
            {t("d.wg_open", "Open Wallet Guard")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
        <p className="text-sm text-graphite">
          {t("d.wg_copy", "Check a Bitcoin wallet before you pay. Graph-verified by TigerGraph.")}
        </p>
        <form onSubmit={go} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("d.wg_placeholder", "Paste a Bitcoin address")}
            aria-label={t("d.wg_placeholder", "Paste a Bitcoin address")}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
          <Button type="submit" size="sm" className="shrink-0">
            {t("d.wg_check", "Check wallet")}
          </Button>
        </form>
        <p className="text-[11px] text-pewter">
          {t("d.wg_note", "A risk signal from a research dataset, not an accusation.")}
        </p>
      </CardContent>
    </Card>
  );
}
