"use client";

import { Button } from "@/components/ui/Button";
import { EAS_CONTRACT, EAS_SCHEMA_UID } from "@/lib/crypto/env";
import { ATTEST_ERROR_TEXT, classifyAttestError, HashMismatchError, isBytes32, txUrl, type AttestErrorKind } from "@/lib/crypto/eas/rules";
import type { AttestSubject } from "@/lib/crypto/eas/subject";
import { checkSubjectHash, type LocalHashCheck } from "@/lib/crypto/eas/verify";
import { CHAIN, HAS_WALLETCONNECT } from "@/lib/crypto/web3Config";
import { useT } from "@/lib/i18n";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { AttestStepper } from "./AttestStepper";
import { AttestSuccess } from "./AttestSuccess";
import { ExtLink, Notice, shortHex } from "./Bits";
import { SubjectSummary } from "./SubjectSummary";
import { VerifyHash } from "./VerifyHash";

const FAUCET_URL = "https://docs.base.org/base-chain/tools/network-faucets";

type Guard = LocalHashCheck | { outcome: "error" } | { outcome: "pending" };

/** Recomputes the hash from the displayed data (keccak loaded on demand) and compares with any independent hash. */
function useHashGuard(subject: AttestSubject): Guard {
  const [state, setState] = useState<{ subject: AttestSubject; guard: Guard } | null>(null);
  useEffect(() => {
    let live = true;
    import("@/lib/crypto/eas/keccak")
      .then(({ keccakUtf8 }) => {
        if (!live) return;
        try {
          setState({ subject, guard: checkSubjectHash(subject, keccakUtf8) });
        } catch {
          setState({ subject, guard: { outcome: "error" } });
        }
      })
      .catch(() => {
        if (live) setState({ subject, guard: { outcome: "error" } });
      });
    return () => {
      live = false;
    };
  }, [subject]);
  return state?.subject === subject ? state.guard : { outcome: "pending" };
}

/**
 * The real flow. MUST be rendered inside <Web3Scope> (see AttestScope). Connect -> Switch network -> Sign -> Done.
 * Browser/extension wallets are always offered; WalletConnect appears only if NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 */
export default function AttestFlow({ subject }: { subject: AttestSubject }) {
  const { t } = useT();
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient({ chainId: CHAIN.id });
  const { openConnectModal } = useConnectModal();
  const guard = useHashGuard(subject);
  const [busy, setBusy] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<AttestErrorKind | null>(null);

  const schemaSet = EAS_SCHEMA_UID !== "";
  const schemaValid = schemaSet && isBytes32(EAS_SCHEMA_UID);
  const blocked = guard.outcome === "mismatch" || guard.outcome === "error";
  const onRightChain = chainId === CHAIN.id;
  const step = uid ? 4 : !isConnected ? 0 : !onRightChain ? 1 : 2;
  const ackMissing = subject.requiresAck !== undefined && !ack;

  const fail = (e: unknown) => setError(classifyAttestError(e).kind);

  const switchNetwork = async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: CHAIN.id });
    } catch (e) {
      fail(e);
    }
  };

  const sign = async () => {
    if (!walletClient || !address || blocked || !schemaValid) return;
    setError(null);
    setTxHash(null);
    setBusy(true);
    try {
      // Signing code (ethers + EAS SDK) is only downloaded now, when the person actually signs.
      const [{ submitFields }, { clientToSigner }, { keccakUtf8 }] = await Promise.all([
        import("@/lib/crypto/eas/attest"),
        import("@/lib/crypto/eas/signer"),
        import("@/lib/crypto/eas/keccak"),
      ]);
      // Last line of defence: recompute right before signing; never write a hash that does not match.
      const check = checkSubjectHash(subject, keccakUtf8);
      if (check.outcome === "mismatch") throw new HashMismatchError(check.local, check.backend);
      const newUid = await submitFields({
        signer: clientToSigner(walletClient),
        contract: EAS_CONTRACT,
        schemaUid: EAS_SCHEMA_UID,
        recipient: address,
        fields: subject.fieldsFor(check.local),
        onSubmitted: setTxHash,
      });
      setUid(newUid);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const signDisabled = !schemaValid || !walletClient || blocked || guard.outcome === "pending" || ackMissing;

  let action: React.ReactNode = null;
  if (!uid) {
    if (step === 0) {
      action = (
        <Button variant="primary" className="self-start" onClick={openConnectModal} disabled={!openConnectModal}>
          {t("web3.button.connectFirst", "Connect wallet")}
        </Button>
      );
    } else if (step === 1) {
      action = (
        <Button variant="primary" className="self-start" disabled={switching} onClick={switchNetwork}>
          {switching ? t("web3.button.switching", "Switching…") : t("web3.button.switch", "Switch to Base Sepolia")}
        </Button>
      );
    } else {
      action = (
        <Button variant="primary" className="self-start" disabled={signDisabled || busy} onClick={sign}>
          {busy
            ? txHash
              ? t("web3.tx.pending", "Waiting for confirmation…")
              : t("web3.button.creating", "Confirm in your wallet…")
            : t("web3.button.create", "Sign attestation on Base Sepolia")}
        </Button>
      );
    }
  }

  const errText = error ? ATTEST_ERROR_TEXT[error] : null;

  return (
    <div className="flex flex-col gap-4">
      <AttestStepper current={step} />
      <p className="sr-only" aria-live="polite">
        {uid ? t("web3.success.title", "Attestation created") : ""}
      </p>
      {!schemaSet && (
        <Notice tone="info">
          <p className="font-semibold">{t("web3.setup.title", "Real attestation is not configured")}</p>
          <p>
            {t(
              "web3.setup.schema",
              "Set NEXT_PUBLIC_EAS_SCHEMA_UID (the UID of the registered EAS schema on Base Sepolia) to enable signing. Until then the sign button stays disabled; use the SIMULATED preview to see the steps.",
            )}
          </p>
        </Notice>
      )}
      {schemaSet && !schemaValid && (
        <Notice tone="error">
          {t("web3.setup.schemaInvalid", "NEXT_PUBLIC_EAS_SCHEMA_UID is not a 0x-prefixed 32-byte value, so signing is disabled.")}
        </Notice>
      )}
      {!HAS_WALLETCONNECT && step === 0 && (
        <p className="text-xs text-pewter">
          {t(
            "web3.connect.noProject",
            "Browser and extension wallets only. WalletConnect (mobile wallets) needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.",
          )}
        </p>
      )}
      <SubjectSummary subject={subject} />
      {guard.outcome === "mismatch" && (
        <Notice tone="error">{ATTEST_ERROR_TEXT.hash_mismatch.text}</Notice>
      )}
      {guard.outcome === "error" && (
        <Notice tone="error">
          {t("web3.error.hashCompute", "The hash could not be computed in this browser, so signing is disabled.")}
        </Notice>
      )}
      {isConnected && address && !uid && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-graphite">
          {t("web3.connect.as", "Connected as")} <span className="font-mono text-ink" title={address}>{shortHex(address, 8, 6)}</span>
          <button
            type="button"
            onClick={() => disconnect()}
            className="cursor-pointer underline underline-offset-2 hover:text-ink"
          >
            {t("web3.connect.disconnect", "Disconnect")}
          </button>
        </p>
      )}
      {subject.requiresAck && !uid && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-graphite">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 size-4 flex-none accent-[var(--color-navy)]"
          />
          <span>{subject.requiresAck}</span>
        </label>
      )}
      {txHash && !uid && (
        <Notice tone="info" action={<ExtLink href={txUrl(txHash)}>{t("web3.tx.view", "View transaction")}</ExtLink>}>
          {t("web3.tx.pending", "Transaction sent, waiting for confirmation…")}
        </Notice>
      )}
      {errText && (
        <Notice
          tone="error"
          action={
            error === "insufficient_funds" ? <ExtLink href={FAUCET_URL}>{t("web3.error.faucet", "Get test ETH")}</ExtLink> : undefined
          }
        >
          {t(errText.key, errText.text)}
        </Notice>
      )}
      {uid ? <AttestSuccess uid={uid} txHash={txHash} /> : action}
      <VerifyHash subject={subject} uid={uid ?? undefined} />
    </div>
  );
}
