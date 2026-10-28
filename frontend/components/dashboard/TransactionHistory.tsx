import { useT } from "@/lib/i18n";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { ReviewStatus, Transaction } from "@/lib/types";
import { CATEGORY_META } from "@/lib/spend";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { MerchantLogo } from "@/components/dashboard/MerchantLogo";
import { BigAmount } from "@/components/dashboard/BigAmount";
import { cn } from "@/lib/utils";

const STATUS: Record<ReviewStatus, { label: string; cls: string }> = {
  reviewed: { label: "Completed", cls: "bg-tint-leaf text-leaf" },
  pending: { label: "Completed", cls: "bg-tint-leaf text-leaf" }, // the money has moved; "pending" here only meant not yet reviewed
  skipped: { label: "Skipped", cls: "bg-fog text-graphite" },
};

/** Latest transactions as a table: name, date, category, amount, review status. */
export function TransactionHistory({ txns }: { txns: Transaction[] }) {
  const { t: tr } = useT();
  const rows = [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-lg">{tr("th.title")}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/transactions">{tr("th.all")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-pewter">{tr("th.empty")}</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-xs text-pewter">
                {["Name", "Date", "Transaction", "Amount", "Status", "Action"].map((h) => (
                  <th key={h} className="py-3 pr-3 font-medium last:text-right">
                    {tr("th." + h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const st = STATUS[t.review_status ?? "reviewed"];
                const meta = CATEGORY_META[t.category];
                return (
                  <tr key={t.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-3 font-medium text-ink">
                        <MerchantLogo merchant={t.merchant} color={meta.color} />
                        {t.merchant}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-graphite">{formatDate(t.date)}</td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-2 text-ink">
                        <i className="size-2.5 rounded-full" style={{ background: meta.color }} />
                        {tr("cat." + meta.label, meta.label)}
                      </span>
                    </td>
                    <td className={cn("py-3 pr-3", t.amount > 0 && "[&_span]:text-leaf")}>
                      <BigAmount value={t.amount} className="text-sm" />
                    </td>
                    <td className="py-3 pr-3">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", st.cls)}>{tr("th." + st.label)}</span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href="/transactions"
                        aria-label={`${tr("th.open")} ${t.merchant}`}
                        className="inline-flex rounded-full p-1.5 text-pewter hover:bg-fog"
                      >
                        <MoreHorizontal className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
