"use client";

import { useT } from "@/lib/i18n";
import { attestationUrl, txUrl } from "@/lib/crypto/eas/rules";
import { CircleCheck, ExternalLink } from "lucide-react";
import { ExtLink, HashLine } from "./Bits";

/** After a REAL attestation: UID with copy, link to easscan (Base Sepolia), and the transaction link. */
export function AttestSuccess({ uid, txHash }: { uid: string; txHash?: string | null }) {
  const { t } = useT();
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CircleCheck className="size-5 flex-none" aria-hidden strokeWidth={1.75} />
        {t("web3.success.title", "Attestation created on Base Sepolia (testnet)")}
      </p>
      <HashLine label={t("web3.success.uid", "Attestation UID")} value={uid} full />
      {txHash && <HashLine label={t("web3.success.tx", "Transaction")} value={txHash} />}
      <div className="flex flex-wrap gap-2">
        <ExtLink href={attestationUrl(uid)}>
          {t("web3.success.view", "View on easscan")}
          <ExternalLink className="size-3.5" aria-hidden />
        </ExtLink>
        {txHash && (
          <ExtLink href={txUrl(txHash)}>
            {t("web3.tx.view", "View transaction")}
            <ExternalLink className="size-3.5" aria-hidden />
          </ExtLink>
        )}
      </div>
    </div>
  );
}
