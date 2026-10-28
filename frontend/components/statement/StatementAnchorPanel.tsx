"use client";

import { AttestDisclosure } from "@/components/crypto/web3/AttestDisclosure";
import { Notice } from "@/components/crypto/web3/Bits";
import { VerifyHash } from "@/components/crypto/web3/VerifyHash";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { statementSubject } from "@/lib/crypto/eas/statement";
import { useT } from "@/lib/i18n";
import { Anchor } from "lucide-react";
import { useMemo, useState } from "react";
import { auditHashLabel, STATEMENT_PERIOD } from "./auditHash";

/**
 * "Anchor this statement on-chain": SCREEN ONLY (print:hidden, and it lives outside #executive-statement-document,
 * so the print/PDF view is untouched). Takes the statement's existing audit hash and the health score and offers the
 * attestation flow (Base Sepolia testnet) plus a standalone "Verify a statement hash" field that needs no wallet.
 * Hashes only: no transactions, balances or personal data are ever published.
 */
export function StatementAnchorPanel({ userId, healthScore }: { userId: string; healthScore: number }) {
  const { t } = useT();
  const [attestOpen, setAttestOpen] = useState(false);
  const auditHash = auditHashLabel(userId);
  const subject = useMemo(
    () => statementSubject({ auditHash, period: STATEMENT_PERIOD, healthScore }),
    [auditHash, healthScore],
  );

  return (
    <section
      aria-labelledby="anchor-heading"
      className="print:hidden mx-auto flex w-full max-w-[860px] flex-col gap-4"
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-8 flex-none items-center justify-center rounded-xl bg-orange-50 text-ember-dark">
            <Anchor className="size-4" aria-hidden strokeWidth={2} />
          </span>
          <h2 id="anchor-heading" className="font-display text-lg font-semibold tracking-tight text-ink">
            {t("stmt.anchor.title", "Anchor this statement on-chain")}
          </h2>
          <Chip tone="info">{t("web3.chip.network", "Base Sepolia testnet")}</Chip>
        </div>
        <p className="max-w-prose text-sm text-graphite">
          {t(
            "stmt.anchor.intro",
            "Optionally publish a tamper-evident fingerprint of this statement as an EAS attestation, so you can later prove it existed in this form. This is not printed on the statement.",
          )}
        </p>
        <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[max-content_1fr]">
          <dt className="text-graphite">{t("stmt.anchor.audit", "Audit hash on this statement")}</dt>
          <dd className="break-all font-mono text-ink">{auditHash}</dd>
          <dt className="text-graphite">{t("stmt.anchor.period", "Period")}</dt>
          <dd className="font-medium text-ink">{STATEMENT_PERIOD}</dd>
          <dt className="text-graphite">{t("stmt.anchor.score", "Health score")}</dt>
          <dd className="font-medium text-ink">{Math.round(healthScore)} / 100</dd>
        </dl>
        <Notice tone="warning">
          <p className="font-semibold">
            {t("stmt.anchor.hashesOnly", "Hashes only: no transactions, balances, names or account data go on-chain.")}
          </p>
          <p>
            {t(
              "stmt.anchor.public",
              "What is published: document type, period, health score, and two hashes. The attestation is public and permanent, and your connected wallet address appears as the attester.",
            )}
          </p>
        </Notice>
        <Notice tone="info">
          <p>
            {t(
              "stmt.anchor.honest",
              "Heads-up: the printed \"SHA256:\" value is a short reference code derived from the account reference and period, not a digest of the statement's figures. Anchoring it proves that this reference and health score were recorded at a point in time; it does not prove the transaction data. Testnet, not a legal verdict.",
            )}
          </p>
        </Notice>
        <AttestDisclosure
          subject={subject}
          label={t("stmt.anchor.open", "Anchor this statement on Base Sepolia")}
          title={t("stmt.anchor.flowTitle", "Anchor statement hash")}
          onOpenChange={setAttestOpen}
        />
        {!attestOpen && <VerifyHash subject={subject} />}
      </Card>
    </section>
  );
}
