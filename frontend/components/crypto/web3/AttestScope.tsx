"use client";

import type { AttestSubject } from "@/lib/crypto/eas/subject";
import AttestFlow from "./AttestFlow";
import Web3Scope from "./Web3Scope";

/**
 * The lazy chunk: wallet providers + the real flow, mounted ONLY when the person opens the attestation panel
 * (AttestDisclosure imports this with next/dynamic, ssr: false). Nothing outside this subtree sees a wallet.
 */
export default function AttestScope({ subject }: { subject: AttestSubject }) {
  return (
    <Web3Scope>
      <AttestFlow subject={subject} />
    </Web3Scope>
  );
}
