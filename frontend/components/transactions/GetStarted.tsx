"use client";

import Link from "next/link";
import { FileUp, Link2, ReceiptText, ScanText } from "lucide-react";
import { Card } from "@/components/ui/Card";

const WAYS = [
  { href: "/upload", icon: FileUp, title: "Upload a bank statement", body: "Drop in a .csv from your bank (columns: date, description, amount or debit/credit). It is read and sorted for you." },
  { href: "/connect", icon: Link2, title: "Connect a Google Sheet", body: "Keep your expenses in a sheet shared as “Anyone with the link can view”. The app reads it and keeps it in sync." },
  { href: "/photos", icon: ScanText, title: "Add an expense", body: "Type an item and a price, or photograph a receipt. Good for cash spending." },
] as const;

/** Shown to a brand-new signed-in user whose ledger is empty, so zeros are never the end of the screen. */
export function GetStarted() {
  return (
    <Card className="border border-dashed border-mist p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lime/40 text-ink">
          <ReceiptText className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">No transactions yet. Add your first ones.</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-graphite">
            Everything on the dashboard, statement, budgets and copilot is built from your transactions, so those zeros fill in as soon as you add some. Pick whichever is easiest:
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {WAYS.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group flex flex-col gap-1.5 rounded-2xl border border-mist bg-white p-4 transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime">
            <Icon className="size-5 text-ink" aria-hidden />
            <span className="text-sm font-semibold text-ink">{title}</span>
            <span className="text-xs leading-relaxed text-graphite">{body}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-pewter">Just want to look around first? Sign out and press &ldquo;Explore Demo App&rdquo; to try the app on sample profiles.</p>
    </Card>
  );
}
