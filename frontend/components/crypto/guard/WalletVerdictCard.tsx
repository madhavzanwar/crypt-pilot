"use client";
// STUB (owner: wallet-guard agent overwrites this file). Contract: runs the check for `address` and renders the verdict.
import type { CheckResponse, Lang } from "@/lib/crypto/api";

export default function WalletVerdictCard(_props: {
  address: string;
  lang?: Lang;
  onResult?: (response: CheckResponse) => void;
}) {
  return null;
}
