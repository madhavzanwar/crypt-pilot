"use client";

import { useCallback, useState } from "react";
import { Ban, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api, clearApiCache } from "@/lib/api";
import { DATA_CHANGED_EVENT, useAsync, useUserId } from "@/lib/hooks";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { PaymentHelp, upiRef } from "@/components/pay/PaymentHelp";

/** Phone payments: your per-payment limit, payments that were refused (with why), and refund/cancel help for the latest completed one.
 * Normal payments are never flagged; only a payment above your balance or your limit is stopped. */
export function PaymentReviewCard() {
  const userId = useUserId();
  const { data: reviews } = useAsync(useCallback(() => api.payReviews(userId, 3), [userId]), [userId]);
  const { data: history } = useAsync(useCallback(() => api.payHistory(userId), [userId]), [userId]);
  const { data: limit, reload: reloadLimit } = useAsync(useCallback(() => api.payLimit(userId), [userId]), [userId]);
  const [typed, setTyped] = useState<string | null>(null); // null = show the saved limit
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const value = typed ?? (limit?.per_payment ? String(limit.per_payment) : "");

  const blocked = (reviews ?? []).filter((r) => r.status === "blocked").slice(0, 2);
  const last = history?.[0];

  async function save(next: number | null) {
    setBusy(true);
    try {
      await api.setPayLimit(userId, next);
      clearApiCache();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      setTyped(null);
      reloadLimit();
      toast.success(next ? `Limit set to ${formatCurrency(next)} per payment` : "Limit removed");
    } catch {
      toast.error("Could not save the limit");
    } finally {
      setBusy(false);
    }
  }

  const n = Number(value);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-sage"><Smartphone className="size-5" /></span>
          <div>
            <h2 className="font-display text-lg font-medium text-ink">Phone payment limit</h2>
            <p className="text-sm text-graphite">Payments go through as normal. Only a payment above your balance or this limit is stopped.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-graphite">Max per payment ₹</span>
          <Input className="w-32" inputMode="numeric" placeholder="No limit" value={value} onChange={(e) => setTyped(e.target.value.replace(/[^\d]/g, ""))} />
          <Button size="sm" disabled={busy || !(n > 0 && n <= 100000)} onClick={() => save(n)}>Save limit</Button>
          {limit?.per_payment ? <Button size="sm" variant="outline" disabled={busy} onClick={() => save(null)}>Remove</Button> : null}
        </div>

        {blocked.map((b) => (
          <div key={b.id} className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <Ban className="mt-0.5 size-5 shrink-0 text-rose-600" />
            <div className="text-sm">
              <p className="font-medium text-rose-800">{formatCurrency(b.amount)} to {b.payee_name} was not made</p>
              <p className="text-rose-700">{b.review.headline}</p>
              <p className="mt-0.5 text-xs text-rose-700/80">{new Date(b.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. No money left your account.</p>
            </div>
          </div>
        ))}

        {last && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-graphite">Latest phone payment: <b className="text-ink">{formatCurrency(last.amount)}</b> to {last.merchant}</span>
              <Button size="sm" variant="outline" onClick={() => setHelp((h) => !h)}>{help ? "Hide help" : "Refund or cancel help"}</Button>
            </div>
            {help && <PaymentHelp payee={last.merchant} amount={formatCurrency(last.amount)} ref={upiRef(last.id)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
