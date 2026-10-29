"use client";

import { categoryLabel } from "@/components/ui/categoryLabel";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HouseholdInsights, HouseholdNetWorthSummary } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCompact, formatCurrency } from "@/components/ui/money";
import { cn } from "@/lib/utils";

/** Stable per-member colours so a person looks the same in every chart. */
export const MEMBER_COLORS = ["#ff6b1a", "#0fb67a", "#3b6bff", "#ffb81f", "#a855f7", "#f0455a", "#14b8a6", "#64748b"];
export const colorFor = (idx: number) => MEMBER_COLORS[idx % MEMBER_COLORS.length];

const compact = formatCompact;

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(20,20,19,0.08)",
};

function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("border border-black/[0.08] shadow-xs flex flex-col gap-2", className)}>
      <CardHeader className="mb-0">
        <div>
          <CardTitle className="text-sm font-semibold text-ink">{title}</CardTitle>
          {subtitle && <p className="text-[11px] text-graphite mt-0.5">{subtitle}</p>}
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

const Empty = () => <p className="text-xs text-pewter py-10 text-center">Not enough data yet.</p>;

type Member = { user_id: string; display_name: string };

/** Donut: who holds what share of household net worth. */
export function NetWorthDonut({ summary, className }: { summary: HouseholdNetWorthSummary; className?: string }) {
  const data = summary.members_breakdown
    .map((m, i) => ({ name: m.display_name, value: Math.max(0, m.assets), color: colorFor(i) }))
    .filter((d) => d.value > 0);
  return (
    <ChartCard title="Assets Share" subtitle="Who holds what share of household assets" className={className}>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div className="relative h-52">
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-pewter">Assets</span>
            <span className="font-display text-lg font-bold text-ink tnum">{compact(summary.total_assets)}</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.map((d) => (
          <span key={d.name} className="inline-flex items-center gap-1.5 text-graphite">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            {d.name}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

/** Grouped bars: assets vs liabilities per member. */
export function AssetsLiabilitiesChart({ summary, className }: { summary: HouseholdNetWorthSummary; className?: string }) {
  const data = summary.members_breakdown.map((m) => ({ name: m.display_name, Assets: m.assets, Liabilities: m.liabilities }));
  return (
    <ChartCard title="Assets vs Liabilities" subtitle="Balance sheet by member" className={className}>
      <div className="h-52">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={40} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Assets" fill="#0fb67a" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Liabilities" fill="#f0455a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Stacked bars: monthly spending, split by member. */
export function SpendTrendChart({
  insights,
  members,
  className,
}: {
  insights: HouseholdInsights | null;
  members: Member[];
  className?: string;
}) {
  const data = insights?.months.map((m) => ({
    month: monthLabel(m.month),
    ...Object.fromEntries(members.map((mem) => [mem.user_id, m.by_member[mem.user_id] ?? 0])),
  }));
  const hasData = !!insights?.months.some((m) => m.total > 0);
  return (
    <ChartCard title="Monthly Spending" subtitle="Last 6 months, stacked by member" className={className}>
      {!hasData ? (
        <Empty />
      ) : (
        <div className="h-60">
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={40} />
              <Tooltip
                formatter={(v, name) => [formatCurrency(Number(v)), members.find((m) => m.user_id === name)?.display_name ?? name]}
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} formatter={(v) => members.find((m) => m.user_id === v)?.display_name ?? v} />
              {members.map((m, i) => (
                <Bar key={m.user_id} dataKey={m.user_id} stackId="s" fill={colorFor(i)} radius={i === members.length - 1 ? [6, 6, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/** Horizontal bars: where the household's money goes. */
export function CategoryChart({ insights, className }: { insights: HouseholdInsights | null; className?: string }) {
  const top = (insights?.categories ?? []).slice(0, 6).map((c) => ({ name: categoryLabel(c.category), value: c.total }));
  return (
    <ChartCard title="Top Spending Categories" subtitle={insights?.window_label ?? "Last 90 days"} className={className}>
      {top.length === 0 ? (
        <Empty />
      ) : (
        <div className="h-60">
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis type="number" tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={92} className="capitalize" />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar dataKey="value" fill="#3b6bff" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/** Income vs spend per member with savings rate. */
export function CashflowChart({ insights, className }: { insights: HouseholdInsights | null; className?: string }) {
  const data = (insights?.cashflow ?? []).map((c) => ({ name: c.display_name, Income: c.income, Spend: c.spend, rate: c.savings_rate }));
  const hasData = data.some((d) => d.Income > 0 || d.Spend > 0);
  return (
    <ChartCard title="Income vs Spend" subtitle={insights?.window_label ?? "Last 90 days"} className={className}>
      {!hasData ? (
        <Empty />
      ) : (
        <>
          <div className="h-44">
            <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
              <BarChart data={data} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income" fill="#0fb67a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Spend" fill="#ffb81f" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.map((d) => (
              <span key={d.name} className="text-[11px] font-semibold text-graphite bg-fog px-2.5 py-1 rounded-full border border-black/[0.04]">
                {d.name} saves <span className={d.rate > 0 ? "text-emerald-700" : "text-rose-700"}>{d.rate}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}
