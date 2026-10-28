import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Always shown next to anything that takes payment. Mainnet is never used anywhere in CryptPilot. */
export function TestModeBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn("flex items-start gap-2.5 rounded-surface border border-sun/40 bg-tint-sun px-3.5 py-2.5 text-sm text-ink", className)}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-ember-dark" aria-hidden />
      <p>
        <b className="font-semibold">Test mode / testnet only. No real money.</b>{" "}
        <span className="text-graphite">Dodo test checkout, Bitcoin testnet, Monero demo. Never send real funds to these addresses.</span>
      </p>
    </div>
  );
}
