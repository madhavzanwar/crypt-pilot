"use client";

import type { CheckResponse } from "@/lib/crypto/api";
import { canAttest } from "@/lib/crypto/eas/rules";
import { walletSubject } from "@/lib/crypto/eas/subject";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { Ban } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { AttestDisclosure } from "./AttestDisclosure";

/**
 * Entry point for the wallet-check page: `<AttestButton response={checkResponse} />`.
 *
 * Collapsed: a single "Attest on Base Sepolia" button. Expanded: connect wallet -> switch to Base Sepolia (testnet)
 * -> sign an EAS attestation of the report hash -> success card (UID + easscan link) + Verify.
 * Wallet code is NOT in this module's static imports: it loads (next/dynamic, ssr: false) only after the person
 * opens the panel, so the host page, SSR and every other route are unaffected.
 *
 * Gating (same as Cryptiq): only status "ok" results with verdict ALLOW/WARN/BLOCK and a score are attested.
 * UNKNOWN / not_in_dataset mean "no evidence"; a permanent on-chain record of that would read as an all-clear.
 */
export default function AttestButton({ response }: { response: CheckResponse }) {
  const { t } = useT();
  const subject = useMemo(() => walletSubject(response), [response]);
  if (response.status === "error") return null;
  if (!canAttest(response)) {
    return (
      <Card className="flex items-start gap-3 print:hidden">
        <Ban className="mt-0.5 size-5 flex-none text-pewter" aria-hidden strokeWidth={1.75} />
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {t("web3.unknown.title", "Nothing to attest for this result")}
          </h3>
          <p className="mt-1 max-w-prose text-xs text-graphite">
            {t(
              "web3.unknown.body",
              "Only wallets with a verdict and evidence can be attested. An UNKNOWN or not-in-dataset result carries no evidence, and a permanent on-chain record of it could be mistaken for an all-clear.",
            )}
          </p>
        </div>
      </Card>
    );
  }
  return <AttestDisclosure subject={subject} />;
}
