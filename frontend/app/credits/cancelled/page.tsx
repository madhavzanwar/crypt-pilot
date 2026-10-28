import type { Metadata } from "next";
import { CreditsCancelled } from "@/components/crypto/credits/CreditsReturn";

// Public on purpose (outside the (app) AuthGate), like /credits/success.
export const metadata: Metadata = { title: "Checkout cancelled | CryptPilot" };

export default function CreditsCancelledPage() {
  return <CreditsCancelled />;
}
