"use client";

import { Button } from "@/components/ui/Button";
import { useCryptoT as useT } from "@/lib/crypto/i18n";
import type { AttestSubject } from "@/lib/crypto/eas/subject";
import {
  checkEnteredHash,
  checkSubjectHash,
  classifyVerifyError,
  compareOnChain,
  FIELD_LABEL,
  type EnteredHashCheck,
  type LocalHashCheck,
  type OnChainComparison,
  type VerifyErrorKind,
} from "@/lib/crypto/eas/verify";
import { isBytes32 } from "@/lib/crypto/eas/rules";
import { cn } from "@/lib/utils";
import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { HashLine } from "./Bits";

type ChainState = { kind: "done"; cmp: OnChainComparison } | { kind: "error"; error: VerifyErrorKind } | { kind: "bad_uid" };
type Tone = "match" | "mismatch" | "warn" | "na";
const TONE: Record<Tone, { cls: string; Icon: typeof CircleCheck }> = {
  match: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CircleCheck },
  mismatch: { cls: "border-rose-200 bg-rose-50 text-rose-800", Icon: CircleX },
  warn: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: TriangleAlert },
  na: { cls: "border-mist bg-fog text-graphite", Icon: CircleHelp },
};

function Row({ label, tone, word, note }: { label: string; tone: Tone; word: string; note?: string }) {
  const { cls, Icon } = TONE[tone];
  return (
    <li className={cn("flex flex-col gap-1 rounded-xl border px-3.5 py-2.5 text-xs", cls)}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span>{label}</span>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Icon className="size-4" aria-hidden strokeWidth={1.75} />
          {word}
        </span>
      </span>
      {note && <span className="leading-relaxed">{note}</span>}
    </li>
  );
}

const inputCls =
  "min-h-11 w-full rounded-chip border border-mist bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy";

/**
 * "Verify": recomputes the hash in the browser from the DISPLAYED data and
 *  (1) compares it with an independent expectation when there is one (the backend's report hash),
 *  (2) compares it with a hash the person pastes ("verify a hash"),
 *  (3) when an attestation UID is known/entered, reads the attestation from Base Sepolia (public RPC, no wallet)
 *      and compares subject, chain, score, verdict and hash.
 * "Match" appears only after a real comparison; any failure to reach the chain says so. No wallet is involved,
 * so this works with or without a connected wallet.
 */
export function VerifyHash({
  subject,
  uid,
  showInputs = true,
  simulated = false,
}: {
  subject: AttestSubject;
  uid?: string;
  showInputs?: boolean;
  simulated?: boolean;
}) {
  const { t } = useT();
  const hashId = useId();
  const uidId = useId();
  const [running, setRunning] = useState(false);
  const [hashInput, setHashInput] = useState("");
  const [uidInput, setUidInput] = useState("");
  const [local, setLocal] = useState<LocalHashCheck | null>(null);
  const [entered, setEntered] = useState<EnteredHashCheck | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);
  const [failed, setFailed] = useState(false);

  const effectiveUid = (uid ?? uidInput.trim()) || undefined;

  const run = async () => {
    setRunning(true);
    setChain(null);
    setFailed(false);
    try {
      // keccak (viem) is only downloaded now, when the person verifies.
      const { keccakUtf8 } = await import("@/lib/crypto/eas/keccak");
      setLocal(checkSubjectHash(subject, keccakUtf8));
      setEntered(checkEnteredHash(subject, hashInput, keccakUtf8));
      if (effectiveUid && !simulated) {
        if (!isBytes32(effectiveUid)) {
          setChain({ kind: "bad_uid" });
        } else {
          try {
            const { fetchAttestation } = await import("@/lib/crypto/eas/chain");
            const att = await fetchAttestation(effectiveUid);
            setChain({
              kind: "done",
              cmp: compareOnChain(subject, att.fields, keccakUtf8, { revoked: att.revoked }),
            });
          } catch (e) {
            setChain({ kind: "error", error: classifyVerifyError(e) });
          }
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  };

  const localRow = (() => {
    if (!local) return null;
    if (local.outcome === "no_backend_hash")
      return (
        <Row
          label={t("web3.verify.local", "Recomputed in your browser")}
          tone="na"
          word={t("web3.verify.recomputed", "Computed")}
          note={t(
            "web3.verify.noExpected",
            "There is no second, independent hash to compare this against, so this is not a match, just the value computed from the data above.",
          )}
        />
      );
    return (
      <Row
        label={t("web3.verify.localVsBackend", "Recomputed hash vs. the service's hash")}
        tone={local.outcome === "match" ? "match" : "mismatch"}
        word={local.outcome === "match" ? t("web3.verify.match", "Match") : t("web3.verify.mismatch", "Does not match")}
      />
    );
  })();

  const enteredRow = (() => {
    if (!entered || entered.outcome === "empty") return null;
    const label = t("web3.verify.entered", "Hash you entered");
    if (entered.outcome === "invalid")
      return (
        <Row
          label={label}
          tone="warn"
          word={t("web3.verify.invalid", "Not a hash")}
          note={t("web3.verify.invalidNote", "Enter a 0x-prefixed 32-byte (64 hex digits) value.")}
        />
      );
    if (entered.outcome === "match")
      return (
        <Row
          label={label}
          tone="match"
          word={t("web3.verify.match", "Match")}
          note={`${entered.matched}${entered.derived ? " (keccak256 derived from the text you entered)" : ""}`}
        />
      );
    return (
      <Row
        label={label}
        tone="mismatch"
        word={t("web3.verify.mismatch", "Does not match")}
        note={entered.derived ? t("web3.verify.derivedNote", "Compared as keccak256 of the text you entered.") : undefined}
      />
    );
  })();

  const chainRow = (() => {
    if (!chain) return null;
    const label = t("web3.verify.chain", "On-chain attestation vs. the data above");
    if (chain.kind === "bad_uid")
      return (
        <Row label={label} tone="warn" word={t("web3.verify.invalid", "Not a hash")} note={t("web3.verify.badUid", "An attestation UID is a 0x-prefixed 32-byte value.")} />
      );
    if (chain.kind === "error") {
      const text =
        chain.error === "network"
          ? t("web3.verify.network", "Could not reach Base Sepolia right now. This is not a mismatch; try again.")
          : chain.error === "not_found"
            ? t("web3.verify.notFound", "No attestation with this UID exists on Base Sepolia.")
            : t("web3.verify.other", "The attestation could not be read or decoded.");
      return <Row label={label} tone="warn" word={t("web3.verify.na", "Not checked")} note={text} />;
    }
    const { cmp } = chain;
    if (cmp.outcome === "match") return <Row label={label} tone="match" word={t("web3.verify.match", "Match")} />;
    if (cmp.outcome === "revoked")
      return (
        <Row
          label={label}
          tone="warn"
          word={t("web3.verify.revoked", "Revoked")}
          note={t("web3.verify.revokedNote", "The attester revoked this attestation; treat it as withdrawn.")}
        />
      );
    return (
      <Row
        label={label}
        tone="mismatch"
        word={t("web3.verify.mismatch", "Does not match")}
        note={`${t("web3.verify.different", "Differs in")}: ${cmp.mismatched.map((f) => FIELD_LABEL[f]).join(", ")}`}
      />
    );
  })();

  return (
    <div className="flex flex-col gap-3 border-t border-mist pt-4">
      <h4 className="text-sm font-semibold text-ink">{t("web3.verify.heading", "Verify")}</h4>
      <p className="text-xs text-graphite">
        {simulated
          ? t(
              "web3.verify.simNote",
              "Verification below is real and local: it recomputes the hash from the data shown. SIMULATED mode has no on-chain attestation to read.",
            )
          : t(
              "web3.verify.intro",
              "Recompute the hash from the data shown above and compare it with a hash you paste or with the attestation on Base Sepolia. Nothing here needs a wallet.",
            )}
      </p>
      {showInputs && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={hashId} className="text-xs font-medium text-ink">
              {subject.kind === "statement"
                ? t("web3.verify.statementHashField", "Verify a statement hash")
                : t("web3.verify.hashField", "Verify a report hash")}
            </label>
            <input
              id={hashId}
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              placeholder={subject.acceptRawInput ? "0x… or the printed audit hash (SHA256:…)" : "0x… (32 bytes)"}
              spellCheck={false}
              autoComplete="off"
              className={inputCls}
            />
          </div>
          {!simulated && (
            <div className="flex flex-col gap-1">
              <label htmlFor={uidId} className="text-xs font-medium text-ink">
                {t("web3.verify.uidField", "Attestation UID (optional)")}
              </label>
              <input
                id={uidId}
                value={uid ?? uidInput}
                readOnly={uid !== undefined}
                onChange={(e) => setUidInput(e.target.value)}
                placeholder="0x… (32 bytes)"
                spellCheck={false}
                autoComplete="off"
                className={inputCls}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={running} onClick={run}>
          {running ? t("web3.verify.running", "Verifying…") : t("web3.verify.button", "Verify")}
        </Button>
        {failed && <span className="text-xs text-rose-700">{t("web3.verify.failed", "Verification failed to run.")}</span>}
      </div>
      <ul aria-live="polite" className="flex flex-col gap-2">
        {localRow}
        {enteredRow}
        {chainRow}
      </ul>
      {local && <HashLine label={`${subject.hashLabel} (recomputed)`} value={local.local} full />}
    </div>
  );
}
