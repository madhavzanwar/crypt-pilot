import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const AXIS = { fontSize: 11, fill: "var(--color-pewter)" } as const;
export const GRID = "rgba(15, 23, 42, 0.05)";
export const money = (v: number) => formatCurrency(v);
export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export function Section({ title, sub, children, className }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {sub && <p className="mt-0.5 text-xs text-pewter">{sub}</p>}
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

export const RISK_TONE = {
  low: "bg-lime/70 text-ink",
  moderate: "bg-amber-200 text-ink",
  high: "bg-ember text-white",
} as const;

export function RiskChip({ level }: { level: keyof typeof RISK_TONE }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", RISK_TONE[level])}>{level} risk</span>;
}
