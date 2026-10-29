"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import type { RecomputeDiff } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Chip } from "@/components/ui/Chip";
import { formatDate } from "@/lib/format";
import { humanizeSlugs, validateAmount, validateEventDate, validateText } from "@/lib/validate";
import { cn } from "@/lib/utils";

type EventKind = "transaction" | "recurring";

export function TimelineTab() {
  const userId = useUserId();
  const [kind, setKind] = useState<EventKind>("transaction");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("1000");
  const [touched, setTouched] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [diff, setDiff] = useState<RecomputeDiff | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    merchant: validateText(merchant, "Description"),
    amount: validateAmount(amount, "Amount"),
    date: validateEventDate(date),
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.merchant || errors.amount || errors.date) return setError(null);
    setSubmitting(true);
    setError(null);
    setDiff(null);
    try {
      const signedAmount = -Math.abs(Number(amount));
      const payload =
        kind === "transaction"
          ? { kind: "transaction", merchant: merchant.trim(), amount: signedAmount, date }
          : { kind: "recurring", merchant: merchant.trim(), amount: signedAmount, frequency, next_expected_date: date };
      const result = await api.addEvent(userId, payload);
      setDiff(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Log an event</CardTitle>
          <p className="text-sm text-graphite">Add a future expense or bill and see how your cash flow and health score react.</p>
        </CardHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-6">
          <Tabs value={kind} onValueChange={(v) => setKind(v as EventKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="transaction">One-off expense</TabsTrigger>
              <TabsTrigger value="recurring">Recurring bill</TabsTrigger>
            </TabsList>
          </Tabs>

          <Field label="Merchant or description" error={show("merchant")}>
            <Input required aria-invalid={!!show("merchant")} maxLength={200} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Health insurance premium" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)" error={show("amount")}>
              <Input required type="number" min={1} aria-invalid={!!show("amount")} value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" />
            </Field>
            <Field label={kind === "transaction" ? "Date" : "First due date"} error={show("date")}>
              <Input required type="date" aria-invalid={!!show("date")} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          {kind === "recurring" && (
            <Field label="Billing frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
          )}

          <div className="flex items-center gap-4 pb-1">
            <Button type="submit" disabled={submitting} className="rounded-full bg-lime px-6 text-ink hover:bg-lime/85">
              {submitting ? "Recomputing…" : "Add and recompute"}
            </Button>
            {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
          </div>
        </form>
      </Card>

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {diff ? (
            <motion.div key="diff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <DiffCard diff={diff} />
            </motion.div>
          ) : (
            <p key="empty" className="rounded-card border-2 border-dashed border-mist p-10 text-center text-sm text-graphite">
              The effect on your health score and forecast shows up here after you add an event.
            </p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-pewter">{label}</span>
      {children}
      {error && <span role="alert" className="text-xs font-medium text-rose-600 normal-case tracking-normal">{error}</span>}
    </label>
  );
}

function DiffCard({ diff }: { diff: RecomputeDiff }) {
  const scoreDelta = diff.health_score_after - diff.health_score_before;

  return (
    <Card className="gap-5 px-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-ember text-white flex items-center justify-center text-xs font-bold">
            Δ
          </span>
          <CardTitle>What changed</CardTitle>
        </div>
      </CardHeader>

      {diff.narrative && (
        <div className="rounded-surface border border-black/[0.06] bg-white p-4 text-sm leading-relaxed text-graphite">
          {humanizeSlugs(diff.narrative)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 pt-2">
        <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter">
            Health Score Impact
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-graphite line-through tnum">
              {Math.round(diff.health_score_before)}
            </span>
            <span className="text-pewter">→</span>
            <span className="font-display text-3xl font-bold text-ink tnum">
              {Math.round(diff.health_score_after)}
            </span>
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-full",
                scoreDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}
            >
              ({scoreDelta >= 0 ? "+" : ""}
              {Math.round(scoreDelta)})
            </span>
          </div>
        </div>

        <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter">
            Projected Gap Date
          </p>
          <div className="mt-2 flex items-baseline gap-2 text-sm">
            <span className="text-graphite">
              {diff.forecast_first_gap_before ? formatDate(diff.forecast_first_gap_before) : "None"}
            </span>
            <span className="text-pewter">→</span>
            <span className="font-semibold text-ink">
              {diff.forecast_first_gap_after ? formatDate(diff.forecast_first_gap_after) : "None"}
            </span>
          </div>
        </div>
      </div>

      {diff.new_recommendations.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter mb-2">
            New Recommendations Triggered
          </p>
          <ul className="flex flex-col gap-2">
            {diff.new_recommendations.map((r, i) => (
              <li
                key={i}
                className="rounded-chip border border-black/[0.06] bg-white p-3.5 text-sm font-medium text-ink shadow-sm flex items-center gap-2"
              >
                <span className="h-2 w-2 rounded-full bg-ember shrink-0" />
                <span>{humanizeSlugs(r.text)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.removed_recommendation_actions.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter mb-2">
            Superseded Actions
          </p>
          <div className="flex flex-wrap gap-2">
            {diff.removed_recommendation_actions.map((a, i) => (
              <Chip key={i} tone="outline">
                {a.replace(/_/g, " ")}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
