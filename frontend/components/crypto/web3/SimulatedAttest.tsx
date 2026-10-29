"use client";

import { Button } from "@/components/ui/Button";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import type { AttestSubject } from "@/lib/crypto/eas/subject";
import { useEffect, useRef, useState } from "react";
import { AttestStepper } from "./AttestStepper";
import { Notice } from "./Bits";
import { SubjectSummary } from "./SubjectSummary";
import { VerifyHash } from "./VerifyHash";

const STEP_MS = 650;

/**
 * Clearly-labelled preview: walks Connect -> Switch network -> Sign -> Done on screen with NO wallet and NO
 * transaction. It never shows anything that looks like a real UID, transaction hash or explorer link, on purpose.
 * The hashes in the summary and the Verify panel below are real local computations of the data shown.
 */
export function SimulatedAttest({ subject, reason }: { subject: AttestSubject; reason?: string }) {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const play = () => {
    setStep(0);
    setRunning(true);
    let i = 0;
    const tick = () => {
      i += 1;
      setStep(i);
      if (i < 4) timer.current = window.setTimeout(tick, STEP_MS);
      else setRunning(false);
    };
    timer.current = window.setTimeout(tick, STEP_MS);
  };

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="simulated">
        <p className="font-semibold">
          {t("web3.simulated.badge", "SIMULATED preview (no wallet, no transaction)")}
        </p>
        <p>
          {reason ??
            t(
              "web3.simulated.note",
              "This only shows the steps. Nothing is signed or sent, and no real attestation UID or transaction exists.",
            )}
        </p>
      </Notice>
      <AttestStepper current={step} />
      <SubjectSummary subject={subject} />
      {step >= 4 ? (
        <Notice tone="simulated">
          <p className="font-semibold">{t("web3.simulated.done", "Preview finished: SIMULATED (no transaction)")}</p>
          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt>{t("web3.success.uid", "Attestation UID")}</dt>
            <dd className="font-mono" translate="no" lang="en">SIMULATED (no transaction)</dd>
            <dt>{t("web3.success.tx", "Transaction")}</dt>
            <dd className="font-mono" translate="no" lang="en">SIMULATED (no transaction)</dd>
          </dl>
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={running} onClick={play}>
          {running
            ? t("web3.simulated.running", "Running preview…")
            : step >= 4
              ? t("web3.simulated.again", "Run the SIMULATED preview again")
              : t("web3.simulated.start", "Run SIMULATED preview")}
        </Button>
      </div>
      <VerifyHash subject={subject} simulated />
    </div>
  );
}
