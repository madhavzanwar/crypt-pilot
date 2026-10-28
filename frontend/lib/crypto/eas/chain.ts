import { EAS, ZERO_BYTES32 } from "@ethereum-attestation-service/eas-sdk";
import { JsonRpcProvider } from "ethers";
import { EAS_CONTRACT } from "@/lib/crypto/env";
import { decodeAttestation } from "./attest";
import { BASE_SEPOLIA_RPC, type AttestFields } from "./rules";
import { VerifyError } from "./verify";

/** Heavy half of verification (ethers + EAS SDK): loaded with `await import("@/lib/crypto/eas/chain")` on click only. */

export interface ChainAttestation {
  uid: string;
  schema: string;
  attester: string;
  recipient: string;
  revoked: boolean;
  fields: AttestFields;
}

const TIMEOUT_MS = 15_000;

/** Reads one attestation from the EAS contract on Base Sepolia (read-only public RPC, no wallet needed). */
export async function fetchAttestation(
  uid: string,
  opts: { rpcUrl?: string; contract?: string } = {},
): Promise<ChainAttestation> {
  const provider = new JsonRpcProvider(
    opts.rpcUrl ?? BASE_SEPOLIA_RPC,
    { chainId: 84532, name: "base-sepolia" },
    { staticNetwork: true },
  );
  const eas = new EAS(opts.contract ?? EAS_CONTRACT);
  eas.connect(provider);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const att = await Promise.race([
      eas.getAttestation(uid),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new VerifyError("network", "timeout")), TIMEOUT_MS);
      }),
    ]);
    if (att.uid === ZERO_BYTES32) throw new VerifyError("not_found");
    return {
      uid: att.uid,
      schema: att.schema,
      attester: att.attester,
      recipient: att.recipient,
      revoked: att.revocationTime > BigInt(0),
      fields: decodeAttestation(att.data),
    };
  } finally {
    clearTimeout(timer);
    provider.destroy();
  }
}
