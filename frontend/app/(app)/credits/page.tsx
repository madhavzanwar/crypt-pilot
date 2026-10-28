"use client";

import { ActivityTable } from "@/components/crypto/credits/ActivityTable";
import { CreditsPanel } from "@/components/crypto/credits/CreditsPanel";
import { Card } from "@/components/ui/Card";

const RULES = [
  ["1 credit per new check", "Each wallet you check for the first time costs one credit."],
  ["Repeats are free", "Checking the same wallet again within 10 minutes is served from cache and costs nothing."],
  ["UNKNOWN is free", "If a wallet is not in the dataset, the check answers UNKNOWN and no credit is used."],
  ["Errors are free", "If the graph service fails, you are not charged."],
];

export default function CreditsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Credits</h1>
        <p className="mt-1 max-w-xl text-sm text-graphite">
          Credits pay for AI wallet-risk checks backed by graph evidence. Everything here runs in test mode: Dodo test checkout and Bitcoin testnet. No real money.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <CreditsPanel />
        </Card>
        <Card className="h-fit p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">How credits work</h2>
          <ul className="mt-3 grid gap-3">
            {RULES.map(([title, body]) => (
              <li key={title} className="text-sm">
                <p className="font-semibold text-ink">{title}</p>
                <p className="text-graphite">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-pewter">Test-mode payments are not refundable because nothing real is charged. If a payment did not add credits, try again.</p>
        </Card>
      </div>
      <ActivityTable />
    </div>
  );
}
