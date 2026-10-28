import { Suspense } from "react";
import type { Metadata } from "next";
import { CreditsSuccess } from "@/components/crypto/credits/CreditsReturn";

// Public on purpose (outside the (app) AuthGate): Dodo returns here, and the visitor may not hold a FinPilot login in this browser.
export const metadata: Metadata = { title: "Credits added | CryptPilot" };

export default function CreditsSuccessPage() {
  return (
    <Suspense>
      <CreditsSuccess />
    </Suspense>
  );
}
