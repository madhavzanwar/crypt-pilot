"use client";

import { Suspense } from "react";
import { Calculator, GitCompare, History } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { CompareTab } from "@/components/whatif/CompareTab";
import { TaxTab } from "@/components/whatif/TaxTab";
import { TimelineTab } from "@/components/whatif/TimelineTab";

const TABS = {
  compare: { label: "Compare", icon: GitCompare, blurb: "Change a few decisions and compare cash, savings and debt month by month." },
  tax: { label: "Tax", icon: Calculator, blurb: "See which tax regime leaves you with more, and which deductions to use." },
  timeline: { label: "Timeline", icon: History, blurb: "Add a future expense or bill and watch your forecast and score react." },
} as const;
type Tab = keyof typeof TABS;

/** Compare, Tax and Timeline in one place; /tax and /timeline redirect here with ?tab=. */
function WhatIf() {
  const router = useRouter();
  const param = useSearchParams().get("tab");
  const tab: Tab = param && param in TABS ? (param as Tab) : "compare";
  return (
    <Tabs value={tab} onValueChange={(t) => router.replace(`/scenarios?tab=${t}`, { scroll: false })} className="gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">What-if lab</h1>
          <p className="mt-1 text-sm text-graphite">{TABS[tab].blurb}</p>
        </div>
        <TabsList className="h-auto rounded-full bg-white p-1 shadow-sm">
          {(Object.keys(TABS) as Tab[]).map((t) => {
            const Icon = TABS[t].icon;
            return (
              <TabsTrigger key={t} value={t} className="gap-1.5 rounded-full px-4 py-1.5 data-[state=active]:bg-lime data-[state=active]:text-ink data-[state=active]:shadow-none">
                <Icon className="size-4" /> {TABS[t].label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <TabsContent value="compare"><CompareTab /></TabsContent>
      <TabsContent value="tax"><TaxTab /></TabsContent>
      <TabsContent value="timeline"><TimelineTab /></TabsContent>
    </Tabs>
  );
}

export default function ScenariosPage() {
  return <Suspense><WhatIf /></Suspense>;
}
