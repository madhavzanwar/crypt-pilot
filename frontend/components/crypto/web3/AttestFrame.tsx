"use client";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "./Bits";

/** Shared chrome of the attestation panel: title, one-sentence explanation, permanence + testnet notice. */
export function AttestFrame({
  title,
  simulated = false,
  children,
}: {
  title?: string;
  simulated?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <Card className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-xl bg-orange-50 text-ember-dark">
          <Link2 className="size-4" aria-hidden strokeWidth={2} />
        </span>
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          {title ?? t("web3.panel.title", "Keep proof on-chain")}
        </h3>
        <Chip tone="info">{t("web3.chip.network", "Base Sepolia testnet")}</Chip>
        {simulated && <Chip tone="warning">{t("web3.badge.simulated", "SIMULATED")}</Chip>}
      </div>
      <p className="max-w-prose text-sm text-graphite">
        {t(
          "web3.panel.intro",
          "Sign a public attestation (EAS) that records a fingerprint of this data, so anyone can later check that it was not changed.",
        )}
      </p>
      <Notice tone="warning">
        <p>
          {t(
            "web3.panel.warning",
            "An attestation is public and permanent: it can be revoked but never erased. Only hashes and the summary shown below are published.",
          )}
        </p>
        <p className="font-semibold">
          {t("web3.panel.testnet", "Testnet only (Base Sepolia, chain 84532): no real money, and not a legal verdict.")}
        </p>
      </Notice>
      {children}
    </Card>
  );
}
