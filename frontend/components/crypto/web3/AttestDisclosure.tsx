"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AttestSubject } from "@/lib/crypto/eas/subject";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { Link2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AttestFrame } from "./AttestFrame";
import { SimulatedAttest } from "./SimulatedAttest";

// Wallet + signing code: a client-only chunk, requested only after the panel is opened and "real" mode is shown.
const AttestScope = dynamic(() => import("./AttestScope"), {
  ssr: false,
  loading: () => <Card className="animate-pulse text-sm text-pewter">Loading wallet tools…</Card>,
});

/**
 * Collapsed button that expands into the attestation flow for any AttestSubject (wallet-check result or statement).
 * Real mode (wallet, Base Sepolia) and SIMULATED preview are separate, clearly labelled views; the preview is
 * always one click away so the flow can be shown without a wallet or schema.
 */
export function AttestDisclosure({
  subject,
  label,
  title,
  className,
  defaultOpen = false,
  forceSimulatedReason,
  onOpenChange,
}: {
  subject: AttestSubject;
  label?: string;
  title?: string;
  className?: string;
  defaultOpen?: boolean;
  /** When set, only the SIMULATED preview is offered, with this explanation. */
  forceSimulatedReason?: string;
  /** Lets a host hide its own duplicate controls (e.g. a standalone verify field) while the panel is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const [mode, setMode] = useState<"real" | "simulated">(forceSimulatedReason ? "simulated" : "real");

  if (!open) {
    return (
      <div className={className}>
        <Button variant="secondary" aria-expanded={false} onClick={() => toggle(true)}>
          <Link2 className="size-4" aria-hidden />
          {label ?? t("web3.attest.open", "Attest on Base Sepolia")}
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <AttestFrame title={title} simulated={mode === "simulated"}>
        {mode === "simulated" ? (
          <SimulatedAttest subject={subject} reason={forceSimulatedReason} />
        ) : (
          <AttestScope key={subject.id} subject={subject} />
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-mist pt-3">
          {!forceSimulatedReason && (
            <Button variant="ghost" size="sm" onClick={() => setMode(mode === "real" ? "simulated" : "real")}>
              {mode === "real"
                ? t("web3.mode.toSim", "No wallet? Preview the steps (SIMULATED)")
                : t("web3.mode.toReal", "Back to the real flow")}
            </Button>
          )}
          <Button variant="ghost" size="sm" aria-expanded onClick={() => toggle(false)}>
            {t("web3.attest.close", "Close")}
          </Button>
        </div>
      </AttestFrame>
    </div>
  );
}
