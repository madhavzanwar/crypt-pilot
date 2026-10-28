"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import WalletVerdictCard from "@/components/crypto/guard/WalletVerdictCard";
import { WalletEvidenceNote } from "@/components/copilot/WalletEvidenceNote";
import type { CheckResponse, Lang } from "@/lib/crypto/api";
import { shortAddress } from "@/lib/crypto/address/validate";
import { useVoiceT } from "@/lib/crypto/voice/strings";

/**
 * What goes under a chat message that contains a Bitcoin address: the wallet verdict card (which talks to the
 * crypto service, not to FinPilot's chat backend), or a note when the address fails its checksum.
 * `armed` is false for chats loaded from history: they show a button instead of re-running the check.
 */
export function WalletTurn({
  address,
  checksumValid,
  lang,
  armed,
  onArm,
  result,
  onResult,
  evidenceOpen,
}: {
  address: string;
  checksumValid: boolean;
  lang: Lang;
  armed: boolean;
  onArm: () => void;
  result?: CheckResponse;
  onResult: (r: CheckResponse) => void;
  evidenceOpen: boolean;
}) {
  const { tr } = useVoiceT();

  if (!checksumValid) {
    return (
      <div role="note" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{tr("cp.wallet.typo")}</span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <ShieldCheck className="size-3.5 text-olive" aria-hidden /> {tr("cp.wallet.title")}
        <span className="font-normal text-pewter" title={address}>
          {shortAddress(address)}
        </span>
      </p>
      {armed ? (
        <WalletVerdictCard address={address} lang={lang} onResult={onResult} />
      ) : (
        <div className="flex flex-col items-start gap-1.5 rounded-2xl bg-fog p-4">
          <button
            type="button"
            onClick={onArm}
            className="cursor-pointer rounded-full bg-lime px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-lime-dark"
          >
            {tr("cp.wallet.run")}
          </button>
          <span className="text-[11px] text-pewter">{tr("cp.wallet.runNote")}</span>
        </div>
      )}
      {armed && <p className="text-[11px] text-pewter">{tr("cp.wallet.sub")}</p>}
      {evidenceOpen && result && <WalletEvidenceNote result={result} />}
    </div>
  );
}
