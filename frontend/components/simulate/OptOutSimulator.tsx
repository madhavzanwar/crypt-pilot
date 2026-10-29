"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dumbbell,
  Milk,
  Music2,
  Newspaper,
  PiggyBank,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Tv,
  Wallet,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { RecurringObligation } from "@/lib/types";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Switch } from "@/components/shadcn/switch";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { cn } from "@/lib/utils";

type Group = "subscriptions" | "essentials" | "bills";

interface Item {
  id: string;
  name: string;
  group: Group;
  icon: LucideIcon;
  /** What you pay today, per month. */
  cost: number;
  /** What you'd still spend per month if you cancel (e.g. packet milk instead of a doodhwala). */
  replacement: number;
  cancelled: boolean;
}

const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "subscriptions", label: "Subscriptions", hint: "Music, OTT and apps" },
  { id: "essentials", label: "Daily essentials", hint: "Milk, newspaper and the like" },
  { id: "bills", label: "Bills & memberships", hint: "Gym, internet and other fixed bills" },
];

const DEFAULT_ITEMS: Item[] = [
  { id: "spotify", name: "Spotify", group: "subscriptions", icon: Music2, cost: 119, replacement: 0, cancelled: false },
  { id: "netflix", name: "Netflix", group: "subscriptions", icon: Tv, cost: 199, replacement: 0, cancelled: false },
  { id: "hotstar", name: "Disney+ Hotstar", group: "subscriptions", icon: Tv, cost: 149, replacement: 0, cancelled: false },
  { id: "doodh", name: "Doodhwala (milk)", group: "essentials", icon: Milk, cost: 1800, replacement: 1500, cancelled: false },
  { id: "news", name: "Newspaper", group: "essentials", icon: Newspaper, cost: 300, replacement: 0, cancelled: false },
  { id: "gym", name: "Gym", group: "bills", icon: Dumbbell, cost: 1000, replacement: 0, cancelled: false },
  { id: "wifi", name: "Broadband", group: "bills", icon: Wifi, cost: 600, replacement: 0, cancelled: false },
];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(n));

const pct = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;

const MONTHS = 12;
const SIP_RATE = 0.12; // illustrative annual return on money you save

/** Future value of a monthly SIP of `p` for `months` at SIP_RATE p.a. */
function sipValue(p: number, months: number) {
  const r = SIP_RATE / 12;
  return p * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
}

const FREQ_PER_MONTH: Record<RecurringObligation["frequency"], number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
  irregular: 1,
};

let uid = 0;
const nextId = () => `custom-${++uid}`;

export function OptOutSimulator() {
  const userId = useUserId();
  const [income, setIncome] = useState(10000);
  const [other, setOther] = useState(3500);
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [draft, setDraft] = useState({ name: "", cost: 0 });

  const fetchDashboard = useCallback(() => api.dashboard(userId), [userId]);
  const { data: dashboard } = useAsync(fetchDashboard, [userId]);
  // BUG-062: the 10,000 / 3,500 defaults are an editable example. When the user has data, seed from it once
  // (never overwriting something they typed).
  const [seeded, setSeeded] = useState<"example" | "data">("example");
  const touched = useRef(false);
  useEffect(() => {
    if (!dashboard?.has_data || touched.current || dashboard.monthly_income <= 0) return;
    const listed = DEFAULT_ITEMS.reduce((n, i) => n + i.cost, 0);
    setIncome(Math.round(dashboard.monthly_income));
    setOther(Math.max(0, Math.round(dashboard.monthly_expenses - listed)));
    setSeeded("data");
  }, [dashboard]);
  const detected = (dashboard?.recurring_obligations ?? []).filter((o) => o.category === "subscriptions");

  const patch = (id: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const calc = useMemo(() => {
    const before = items.reduce((s, i) => s + i.cost, 0);
    const after = items.reduce((s, i) => s + (i.cancelled ? i.replacement : i.cost), 0);
    const saving = before - after;
    const savingsBefore = income - other - before;
    const savingsAfter = savingsBefore + saving;
    const rate = (v: number) => (income > 0 ? (v / income) * 100 : 0);
    const cancelledItems = items.filter((i) => i.cancelled);
    const ranked = [...cancelledItems].sort((a, b) => b.cost - b.replacement - (a.cost - a.replacement));
    const chart = Array.from({ length: MONTHS + 1 }, (_, m) => ({
      m,
      before: savingsBefore * m,
      after: savingsAfter * m,
    }));
    return {
      before,
      after,
      saving,
      savingsBefore,
      savingsAfter,
      rateBefore: rate(savingsBefore),
      rateAfter: rate(savingsAfter),
      cancelledCount: cancelledItems.length,
      ranked,
      chart,
      overspent: before + other > income,
    };
  }, [items, income, other]);

  const insights = useMemo(() => {
    const out: { tone: "good" | "warn" | "info"; text: string }[] = [];
    const { saving, ranked, cancelledCount } = calc;
    if (cancelledCount === 0) {
      out.push({ tone: "info", text: "Switch off anything you'd consider cancelling and the impact shows up here instantly." });
      return out;
    }
    const share = income > 0 ? (Math.abs(saving) / income) * 100 : 0;
    out.push(
      saving >= 0
        ? { tone: "good", text: `Opting out of ${cancelledCount} item${cancelledCount > 1 ? "s" : ""} frees up ${inr(saving)} a month, ${pct(share)} of your income.` }
        : { tone: "warn", text: `This plan makes you spend ${inr(-saving)} more a month. The replacements cost more than what you cancel.` },
    );
    const top = ranked[0];
    if (top && top.cost - top.replacement > 0) {
      out.push({ tone: "info", text: `Biggest win: ${top.name}, saving ${inr(top.cost - top.replacement)} a month (${inr((top.cost - top.replacement) * 12)} a year).` });
    }
    for (const i of ranked.filter((r) => r.replacement > r.cost)) {
      out.push({ tone: "warn", text: `Cancelling ${i.name} costs ${inr(i.replacement - i.cost)} more a month than keeping it.` });
    }
    if (saving > 0) {
      out.push({ tone: "good", text: `Savings rate moves from ${pct(calc.rateBefore)} to ${pct(calc.rateAfter)}. Invested at ${pct(SIP_RATE * 100)} a year, the ${inr(saving)} would grow to about ${inr(sipValue(saving, 60))} in 5 years.` });
    }
    if (calc.savingsAfter < 0) {
      out.push({ tone: "warn", text: `Even after this plan you spend ${inr(-calc.savingsAfter)} more than you earn each month.` });
    }
    return out;
  }, [calc, income]);

  const setAll = (pred: (i: Item) => boolean) =>
    setItems((xs) => xs.map((x) => ({ ...x, cancelled: pred(x) })));

  const importDetected = () =>
    setItems((xs) => {
      const have = new Set(xs.map((x) => x.name.toLowerCase()));
      const add = detected
        .filter((o) => !have.has(o.merchant.toLowerCase()))
        .map<Item>((o) => ({
          id: nextId(),
          name: o.merchant,
          group: "subscriptions",
          icon: Receipt,
          cost: Math.round(Math.abs(o.amount) * (FREQ_PER_MONTH[o.frequency] ?? 1)),
          replacement: 0,
          cancelled: false,
        }));
      return [...xs, ...add];
    });

  const addItem = () => {
    if (!draft.name.trim() || draft.cost <= 0) return;
    setItems((xs) => [
      ...xs,
      { id: nextId(), name: draft.name.trim(), group: "subscriptions", icon: Receipt, cost: draft.cost, replacement: 0, cancelled: false },
    ]);
    setDraft({ name: "", cost: 0 });
  };

  const segs = useMemo(() => {
    if (income <= 0) return [];
    const kept = items.reduce((s, i) => s + (i.cancelled ? 0 : i.cost), 0);
    const repl = items.reduce((s, i) => s + (i.cancelled ? i.replacement : 0), 0);
    return [
      { label: "Other expenses", v: other, cls: "bg-steel" },
      { label: "Kept & replacements", v: kept + repl, cls: "bg-carbon" },
      { label: "Left to save", v: Math.max(calc.savingsAfter, 0), cls: "bg-lime-dark" },
    ];
  }, [items, income, other, calc.savingsAfter]);
  const segTotal = segs.reduce((s, x) => s + x.v, 0) || 1;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 pb-8">
      <div className="flex flex-col justify-between gap-3 border-b border-black/[0.04] pb-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">Opt-out Simulator</h1>
          <p className="mt-0.5 text-xs text-graphite sm:text-sm">
            Switch off what you would cancel and see what you save, or spend more, every month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAll((i) => i.group === "subscriptions")}>
            Cancel all subscriptions
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAll(() => true)}>
            Cancel everything
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAll(() => false)}>
            <RotateCcw /> Reset
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Monthly income" value={inr(income)} sub="before any opt-out" icon={Wallet} />
        <KpiCard label="Committed today" value={inr(calc.before)} sub={`${items.length} recurring items`} icon={Receipt} />
        <KpiCard label="Committed after" value={inr(calc.after)} sub={`${calc.cancelledCount} opted out`} icon={TrendingUp} />
        <KpiCard
          label={calc.saving >= 0 ? "You save" : "You spend more"}
          value={inr(Math.abs(calc.saving))}
          sub={`${inr(Math.abs(calc.saving) * 12)} a year`}
          icon={PiggyBank}
          variant="lime"
          badge={{ text: `${pct(calc.rateBefore)} → ${pct(calc.rateAfter)} saved`, positive: calc.saving >= 0 }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: inputs + items */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <Head>
              <CardTitle className="font-display text-lg">Your month</CardTitle>
              <CardDescription>
                {seeded === "data"
                  ? "Started from your monthly income and spending. Edit any number; the subscription list below is an example."
                  : "Income and everything else you spend on, outside the list below. These are editable example numbers."}
              </CardDescription>
            </Head>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="Monthly income" value={income} onChange={(v) => { touched.current = true; setIncome(v); }} />
              <NumField label="Other expenses (rent, food, travel…)" value={other} onChange={(v) => { touched.current = true; setOther(v); }} />
            </CardContent>
          </Card>

          {GROUPS.map((g) => {
            const rows = items.filter((i) => i.group === g.id);
            if (rows.length === 0) return null;
            return (
              <Card key={g.id}>
                <Head>
                  <div>
                    <CardTitle className="font-display text-lg">{g.label}</CardTitle>
                    <CardDescription>{g.hint}</CardDescription>
                  </div>
                  <span className="rounded-full bg-fog px-2.5 py-1 text-xs font-semibold text-ink tnum">
                    {inr(rows.reduce((s, r) => s + r.cost, 0))}/mo
                  </span>
                </Head>
                <CardContent className="flex flex-col gap-2">
                  {rows.map((r) => (
                    <ItemRow
                      key={r.id}
                      item={r}
                      onPatch={(p) => patch(r.id, p)}
                      onRemove={() => setItems((xs) => xs.filter((x) => x.id !== r.id))}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <Head>
              <CardTitle className="font-display text-lg">Add another</CardTitle>
              {detected.length > 0 && (
                <Button variant="outline" size="sm" onClick={importDetected}>
                  <Sparkles className="text-ember" /> Import {detected.length} detected from your accounts
                </Button>
              )}
            </Head>
            <CardContent>
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  addItem();
                }}
              >
                <label className="flex flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter">
                  Name
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. YouTube Premium"
                    className="h-10 rounded-chip border border-black/[0.1] bg-white px-3 text-sm font-medium normal-case tracking-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-lime-dark"
                  />
                </label>
                <NumField label="Cost / month" value={draft.cost} onChange={(cost) => setDraft({ ...draft, cost })} className="sm:w-40" />
                <Button type="submit" disabled={!draft.name.trim() || draft.cost <= 0}>
                  <Plus /> Add
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right: live result */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:col-span-5 lg:self-start">
          <Card>
            <Head>
              <div>
                <CardTitle className="font-display text-lg">Where your income goes</CardTitle>
                <CardDescription>After your opt-outs</CardDescription>
              </div>
            </Head>
            <CardContent className="flex flex-col gap-3">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-fog" role="img" aria-label="Income split">
                {segs.map((s) => (
                  <motion.div
                    key={s.label}
                    className={s.cls}
                    animate={{ width: `${(s.v / segTotal) * 100}%` }}
                    transition={{ type: "spring", stiffness: 140, damping: 22 }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {segs.map((s) => (
                  <div key={s.label} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-graphite">
                      <span className={cn("size-2 rounded-full", s.cls)} />
                      {s.label}
                    </span>
                    <span className="font-semibold text-ink tnum">{inr(s.v)}</span>
                  </div>
                ))}
              </div>
              {calc.overspent && (
                <p className="flex items-start gap-2 rounded-chip bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Your expenses today are more than your income.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <Head>
              <div>
                <CardTitle className="font-display text-lg">Savings over 12 months</CardTitle>
                <CardDescription>Dashed line is your current plan</CardDescription>
              </div>
              <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-ink tnum">
                {inr(calc.savingsAfter * MONTHS)}
              </span>
            </Head>
            <CardContent>
              <div className="h-52 w-full">
                <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
                  <AreaChart data={calc.chart} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="optout-after" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a6d11a" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#a6d11a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(13,13,13,0.06)" />
                    <XAxis dataKey="m" tickFormatter={(m) => `M${m}`} tickLine={false} axisLine={false} fontSize={11} stroke="#7487a3" />
                    <YAxis
                      width={52}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="#7487a3"
                      tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <Tooltip
                      formatter={(v, name) => [inr(Number(v)), name === "after" ? "After opt-out" : "Current plan"]}
                      labelFormatter={(m) => `Month ${m}`}
                    />
                    <Area type="monotone" dataKey="after" stroke="#5f7f0c" strokeWidth={2.5} fill="url(#optout-after)" isAnimationActive={false} />
                    <Line type="monotone" dataKey="before" stroke="#7487a3" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <Head>
              <CardTitle className="font-display text-lg">Analysis</CardTitle>
            </Head>
            <CardContent className="flex flex-col gap-2">
              {insights.map((n, i) => (
                <p
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-chip px-3 py-2 text-sm",
                    n.tone === "good" && "bg-sage/60 text-ink",
                    n.tone === "warn" && "bg-rose-50 text-rose-700",
                    n.tone === "info" && "bg-fog text-graphite",
                  )}
                >
                  {n.tone === "warn" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Sparkles className="mt-0.5 size-4 shrink-0" />}
                  <span>{n.text}</span>
                </p>
              ))}
              {calc.saving > 0 && (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {[12, 36, 60].map((m) => (
                    <div key={m} className="rounded-surface border border-black/[0.06] bg-white p-3">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-pewter">{m / 12} yr SIP</div>
                      <div className="mt-1 font-display text-base font-semibold text-ink tnum">{inr(sipValue(calc.saving, m))}</div>
                    </div>
                  ))}
                </div>
              )}
              {calc.saving > 0 && (
                <p className="text-[11px] text-pewter">
                  SIP figures are illustrative: the monthly saving invested at {pct(SIP_RATE * 100)} a year. Returns are not guaranteed.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Flex header: shadcn CardHeader is a grid and would push the trailing chip onto its own row. */
function Head({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-6">{children}</div>;
}

function NumField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-pewter", className)}>
      {label}
      <span className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-graphite">₹</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-10 w-full rounded-chip border border-black/[0.1] bg-white pl-7 pr-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none tnum focus-visible:ring-2 focus-visible:ring-lime-dark"
        />
      </span>
    </label>
  );
}

function ItemRow({
  item,
  onPatch,
  onRemove,
}: {
  item: Item;
  onPatch: (p: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const Icon = item.icon;
  const delta = item.cancelled ? item.cost - item.replacement : 0;
  return (
    <div
      className={cn(
        "rounded-surface border p-3 transition-colors",
        item.cancelled ? "border-lime-dark/50 bg-sage/30" : "border-black/[0.06] bg-white",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", item.cancelled ? "bg-white/70 text-graphite" : "bg-fog text-ink")}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-semibold text-ink", item.cancelled && "line-through decoration-ink/40")}>{item.name}</div>
          <div className="text-xs text-graphite tnum">{inr(item.cost)}/mo</div>
        </div>
        {item.cancelled && delta !== 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tnum",
              delta > 0 ? "bg-lime text-ink" : "bg-rose-100 text-rose-700",
            )}
          >
            {delta > 0 ? `+${inr(delta)} saved` : `${inr(-delta)} more`}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden w-14 text-right text-xs font-medium text-graphite sm:inline">{item.cancelled ? "Cancelled" : "Keeping"}</span>
          <Switch
            checked={!item.cancelled}
            onCheckedChange={(keep) => onPatch({ cancelled: !keep })}
            aria-label={`${item.cancelled ? "Keep" : "Cancel"} ${item.name}`}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 cursor-pointer rounded-full p-1.5 text-pewter transition-colors hover:bg-fog hover:text-ink"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {item.cancelled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-xs text-graphite sm:max-w-[55%]">
                Will you still spend something instead? Enter it if cancelling means buying it another way.
              </p>
              <NumField
                label="Replacement cost / month"
                value={item.replacement}
                onChange={(replacement) => onPatch({ replacement })}
                className="sm:w-52"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
