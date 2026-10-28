"use client";

import { Banknote, CreditCard, FileText, FolderOpen, LineChart, Mail, Receipt, Wallet } from "lucide-react";
import { ConnectorsGrid } from "@/components/connect/ConnectorsGrid";
import { IntegrationShowcase, type Integration } from "@/components/shadcn/integration-showcase";

const ROADMAP: Integration[] = [
  { name: "Dodo Payments", description: "Card checkout for credits. Test mode, no real charge. Available now.", icon: CreditCard, tone: "bg-tint-sun text-ember-dark" },
  { name: "Cake Wallet", description: "Bitcoin testnet and Monero demo invoices. No real money. Available now.", icon: Wallet, tone: "bg-tint-ember text-ember-dark" },
  { name: "Bank accounts", description: "Balances and salary credits via Account Aggregator.", icon: Banknote, tone: "bg-tint-leaf text-leaf" },
  { name: "Credit cards", description: "Statements, dues and interest charges.", icon: CreditCard, tone: "bg-tint-ember text-ember-dark" },
  { name: "Gmail invoices", description: "Bills and receipts parsed automatically.", icon: Mail, tone: "bg-tint-ember text-ember-dark" },
  { name: "Drive documents", description: "Payslips and Form 16, read and indexed for the copilot.", icon: FolderOpen, tone: "bg-tint-sky text-sky" },
  { name: "Mutual funds & stocks", description: "SIPs and holdings from your depository.", icon: LineChart, tone: "bg-tint-leaf text-leaf" },
  { name: "Tax portal", description: "AIS and 26AS pulled in for the tax optimizer.", icon: Receipt, tone: "bg-tint-sun text-ember-dark" },
  { name: "Statements", description: "Anything else arrives as a document, no typing needed.", icon: FileText },
];

export default function ConnectPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Connect your money</h1>
        <p className="mt-1 max-w-xl text-sm text-graphite">
          Link a source once and FinPilot does the rest: imports, categorises and analyses automatically. There is nothing to type in.
        </p>
      </div>
      <ConnectorsGrid />
      <IntegrationShowcase
        title="Everything connects ~automatically~"
        subtitle="Dodo Payments and Cake Wallet are live in this demo, in test mode only. The rest of the sources below are on the roadmap, so you never type a number in."
        integrations={ROADMAP}
      />
    </div>
  );
}
