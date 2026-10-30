"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { SharedExpensesSummary } from "@/lib/types";
import { isWritable, memberName, namedTransfers, todayISO, validateExpense, type ExpenseErrors } from "@/lib/sharedExpenses";
import { useT } from "@/components/i18nMoney";
import { formatCurrency } from "@/components/ui/money";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/shadcn/input";

const fieldCls = "h-10 w-full rounded-chip border border-mist bg-white px-3 text-sm text-ink";
const Err = ({ id, msg }: { id: string; msg?: string }) =>
  msg ? <p id={id} role="alert" className="mt-1 text-xs text-rose-700">{msg}</p> : null;

/** "Who owes who": balances, suggested settle-up transfers, expenses and settlements for the user's household. */
export function SharedExpensesCard() {
  const { t } = useT();
  const userId = useUserId();
  const { data, loading, error, reload, mutate } = useAsync<SharedExpensesSummary | null>(useCallback(() => api.getSharedExpenses(userId), [userId]), [userId]);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<SharedExpensesSummary>, okMsg: string): Promise<boolean> {
    setActionErr(null);
    setBusy(true);
    try {
      const next = await fn();
      mutate(() => next);
      toast.success(okMsg);
      return true;
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pewter">
        <ArrowRightLeft className="size-3.5" aria-hidden />
        {t("hs.title")}
      </div>
      <h3 id="shared-exp-h" className="mt-1 font-display text-lg font-semibold text-ink">{t("hs.sub")}</h3>
    </>
  );
  const shell = (body: React.ReactNode) => (
    <section className="rounded-card bg-white p-4 shadow-sm sm:p-6" aria-labelledby="shared-exp-h" data-testid="shared-expenses">
      {head}
      {body}
    </section>
  );

  if (loading) return shell(<p className="mt-3 text-sm text-graphite" role="status">{t("hs.loading")}</p>);
  if (error)
    return shell(
      <div className="mt-3">
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <Button size="sm" className="mt-2" onClick={reload}>{t("hs.retry")}</Button>
      </div>,
    );
  if (!data)
    return shell(
      <div className="mt-3">
        <p className="text-sm font-medium text-ink">{t("hs.no_hh")}</p>
        <p className="mt-1 text-sm text-graphite">{t("hs.no_hh_d")}</p>
        <Link href="/household" className="mt-3 inline-flex min-h-9 items-center rounded-chip bg-navy px-3 text-xs font-medium text-white">{t("hs.no_hh_cta")}</Link>
      </div>,
    );

  const writable = isWritable(data);
  const transfers = namedTransfers(data);
  const names = (ids: string[]) => (ids.length === data.members.length ? t("hs.all") : ids.map((i) => memberName(data.members, i)).join(", "));

  return shell(
    <div className="mt-3 grid gap-5">
      {!writable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="sample-note">
          <Chip tone="warning">{t("hs.sample")}</Chip>
          <p className="mt-1">{t("hs.sample_d")}</p>
        </div>
      )}
      {actionErr && <p role="alert" className="text-sm text-rose-700">{actionErr}</p>}

      <div aria-live="polite">
        {transfers.length === 0 ? (
          <p className="text-sm font-medium text-emerald-700">{t("hs.settled")} <span className="font-normal text-graphite">{t("hs.settled_d")}</span></p>
        ) : (
          <ul className="grid gap-2" data-testid="transfers">
            {transfers.map((x) => (
              <li key={`${x.from}-${x.to}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-fog/60 p-3">
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <strong>{x.fromName}</strong> {t("hs.owes")} <strong>{x.toName}</strong>{" "}
                  <span className="tnum font-semibold">{formatCurrency(x.amount)}</span>
                </span>
                {writable && (
                  <Button size="sm" variant="secondary" disabled={busy} aria-label={`${t("hs.settle")}: ${x.fromName} → ${x.toName} ${formatCurrency(x.amount)}`}
                    onClick={() => run(() => api.addSettlement(userId, { from: x.from, to: x.to, amount: x.amount }), t("hs.toast_settled"))}>
                    {t("hs.settle")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("hs.net")}>
        {data.balances.map((b) => (
          <li key={b.member_id} className="rounded-xl border border-mist p-3 text-xs text-graphite" data-testid="balance-chip">
            <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
            <p className="mt-1 flex justify-between"><span>{t("hs.paid")}</span><span className="tnum">{formatCurrency(b.paid)}</span></p>
            <p className="flex justify-between"><span>{t("hs.owed")}</span><span className="tnum">{formatCurrency(b.owed)}</span></p>
            <p className={`flex justify-between font-semibold ${b.net > 0 ? "text-emerald-700" : b.net < 0 ? "text-rose-700" : "text-graphite"}`}>
              <span>{t("hs.net")}</span><span className="tnum">{formatCurrency(b.net)}</span>
            </p>
          </li>
        ))}
      </ul>

      {writable && <AddForm data={data} busy={busy} onAdd={(req) => run(() => api.addSharedExpense(userId, req), t("hs.toast_added"))} />}

      <div>
        <h4 className="text-sm font-semibold text-ink">{t("hs.expenses")}</h4>
        {data.expenses.length === 0 ? (
          <p className="mt-1 text-sm text-graphite">{t("hs.no_expenses")}</p>
        ) : (
          <ul className="mt-1 divide-y divide-mist" data-testid="expense-list">
            {data.expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-graphite">
                    {e.date} · {t("hs.paid_by_x")} {memberName(data.members, e.paid_by)} · {t("hs.split_x")}: {names(e.split_among)}
                    {e.category ? ` · ${e.category}` : ""}
                  </p>
                </div>
                <span className="tnum font-semibold text-ink">{formatCurrency(e.amount)}</span>
                {writable && (
                  <Button size="sm" variant="ghost" disabled={busy} aria-label={`${t("hs.delete")}: ${e.title}`}
                    onClick={() => { if (window.confirm(t("hs.delete_q"))) void run(() => api.deleteSharedExpense(userId, e.id), t("hs.toast_deleted")); }}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink">{t("hs.history")}</h4>
        {data.settlements.length === 0 ? (
          <p className="mt-1 text-sm text-graphite">{t("hs.no_history")}</p>
        ) : (
          <ul className="mt-1 divide-y divide-mist" data-testid="settlement-list">
            {data.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm text-ink">
                <span>{memberName(data.members, s.from)} {t("hs.paid_to")} {memberName(data.members, s.to)} <span className="tnum font-semibold">{formatCurrency(s.amount)}</span></span>
                <time className="text-xs text-graphite">{s.date}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
  );
}

function AddForm({ data, busy, onAdd }: { data: SharedExpensesSummary; busy: boolean; onAdd: (req: { title: string; amount: number; paid_by: string; split_among: string[]; category: string | null; date: string | null }) => Promise<boolean> }) {
  const { t } = useT();
  const ids = data.members.map((m) => m.id);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(ids[0] ?? "");
  const [split, setSplit] = useState<string[]>(ids);
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<ExpenseErrors>({});

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const errs = validateExpense({ title, amount, paidBy, split, date }, ids);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await onAdd({ title: title.trim(), amount: Number(amount), paid_by: paidBy, split_among: split, category: category.trim() || null, date });
    if (ok) { setTitle(""); setAmount(""); setCategory(""); setSplit(ids); setDate(todayISO()); }
  }
  const toggle = (id: string) => setSplit((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl border border-mist p-3 sm:grid-cols-2" aria-label={t("hs.add")}>
      <h4 className="text-sm font-semibold text-ink sm:col-span-2">{t("hs.add")}</h4>
      <div>
        <label htmlFor="se-title" className="text-xs font-medium text-graphite">{t("hs.f_title")}</label>
        <Input id="se-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? "se-title-e" : undefined} />
        <Err id="se-title-e" msg={errors.title} />
      </div>
      <div>
        <label htmlFor="se-amount" className="text-xs font-medium text-graphite">{t("hs.f_amount")}</label>
        <Input id="se-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} aria-describedby={errors.amount ? "se-amount-e" : undefined} />
        <Err id="se-amount-e" msg={errors.amount} />
      </div>
      <div>
        <label htmlFor="se-paid" className="text-xs font-medium text-graphite">{t("hs.f_paid_by")}</label>
        <select id="se-paid" className={fieldCls} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Err id="se-paid-e" msg={errors.paidBy} />
      </div>
      <div>
        <label htmlFor="se-date" className="text-xs font-medium text-graphite">{t("hs.f_date")}</label>
        <Input id="se-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "se-date-e" : undefined} />
        <Err id="se-date-e" msg={errors.date} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-medium text-graphite">{t("hs.f_split")}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {data.members.map((m) => (
            <label key={m.id} className="inline-flex min-h-8 items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={split.includes(m.id)} onChange={() => toggle(m.id)} /> {m.name}
            </label>
          ))}
        </div>
        <Err id="se-split-e" msg={errors.split} />
      </fieldset>
      <div>
        <label htmlFor="se-cat" className="text-xs font-medium text-graphite">{t("hs.f_category")}</label>
        <Input id="se-cat" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="primary" disabled={busy} className="w-full sm:w-auto">{busy ? t("hs.f_saving") : t("hs.f_save")}</Button>
      </div>
    </form>
  );
}
