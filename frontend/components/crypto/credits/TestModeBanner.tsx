"use client";

import { FlaskConical } from "lucide-react";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { cn } from "@/lib/utils";

/** Always shown next to anything that takes payment. Mainnet is never used anywhere in CryptPilot. */
export function TestModeBanner({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <div
      role="note"
      className={cn("flex items-start gap-2.5 rounded-surface border border-sun/40 bg-tint-sun px-3.5 py-2.5 text-sm text-ink", className)}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-ember-dark" aria-hidden />
      <p>
        <b className="font-semibold">{t("cr.test.title", "Test mode / testnet only. No real money.")}</b>{" "}
        <span className="text-graphite">{t("cr.test.body", "Dodo test checkout, Bitcoin testnet, Monero demo. Never send real funds to these addresses.")}</span>
      </p>
    </div>
  );
}
