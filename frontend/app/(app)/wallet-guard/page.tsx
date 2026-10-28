import { Suspense } from "react";
import WalletGuard from "@/components/crypto/guard/WalletGuard";
import { Skeleton } from "@/components/ui/Skeleton";

/** Wallet Guard: check a Bitcoin address, see the verdict, the evidence graph and a bilingual explanation. */
export default function WalletGuardPage() {
  return (
    // useSearchParams (the ?address= deep link) needs a Suspense boundary.
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-6xl rounded-surface" />}>
      <WalletGuard />
    </Suspense>
  );
}
