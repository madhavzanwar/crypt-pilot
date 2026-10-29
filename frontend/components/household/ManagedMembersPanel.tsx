"use client";

import { useCallback, useState } from "react";
import { Baby, Eye, Plus, Receipt, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { HouseholdMember } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/components/ui/money";
import { categoryLabel } from "@/components/ui/labels";

const CATEGORIES = [
  ["groceries", "Groceries"],
  ["dining", "Food & Snacks"],
  ["transport", "Transport"],
  ["shopping", "Shopping"],
  ["healthcare", "Healthcare"],
  ["entertainment", "Entertainment"],
  ["rent_housing", "School / Housing"],
  ["income", "Pocket money / Income"],
  ["other", "Other"],
] as const;

const inputCls =
  "w-full rounded-chip border border-mist bg-white px-3 py-1.5 text-xs text-ink focus:border-ember focus:outline-none";

/**
 * Household-only: add people who have no account in the app (e.g. children) and
 * track their money, plus monitor any member's transactions. Data lives under a
 * synthetic "managed-*" id and never shows up outside the Household section.
 */
export function ManagedMembersPanel({
  userId,
  members,
  canEdit,
  onChanged,
  className,
}: {
  userId: string;
  members: HouseholdMember[];
  canEdit: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Child");
  const [opening, setOpening] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [category, setCategory] = useState("other");
  const [saving, setSaving] = useState(false);

  // Derived (not effect-synced): fall back to the first managed member, then the first member.
  const selected =
    picked && members.some((m) => m.user_id === picked)
      ? picked
      : (members.find((m) => m.is_managed) ?? members[0])?.user_id ?? null;
  const selectedMember = members.find((m) => m.user_id === selected);
  const setSelected = setPicked;

  const fetchLedger = useCallback(
    () => (selected ? api.memberLedger(userId, selected) : Promise.resolve(null)),
    [userId, selected],
  );
  const { data: ledger, error: loadError, reload: reloadLedger } = useAsync(fetchLedger, [userId, selected]);
  const ledgerError = actionError ?? loadError;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await api.addManagedMember(userId, {
        name: name.trim(),
        relationship: relationship.trim(),
        opening_balance: Number(opening) || 0,
      });
      setName("");
      setOpening("");
      const added = res.members.filter((m) => m.is_managed).at(-1);
      if (added) setSelected(added.user_id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!selected || !merchant.trim() || !amt || amt <= 0) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.addManagedTransaction(userId, selected, {
        merchant: merchant.trim(),
        amount: direction === "out" ? -amt : amt,
        category,
      });
      reloadLedger();
      setMerchant("");
      setAmount("");
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save transaction");
    } finally {
      setSaving(false);
    }
  }

  const managedSelected = !!selectedMember?.is_managed;

  return (
    <Card className={cn("p-6 border border-black/[0.08] shadow-xs flex flex-col gap-6", className)}>
      <CardHeader className="mb-0">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 inline-flex items-center gap-1">
            <Baby className="h-3 w-3" />
            Family Members
          </span>
          <CardTitle className="text-lg font-bold text-ink mt-1">Manage Family & Monitor Spending</CardTitle>
          <p className="text-xs text-graphite mt-0.5">
            Add family members who don&apos;t have an account (like children) and track their money here. They only exist
            inside this household. You can also monitor each co-pilot&apos;s transactions.
          </p>
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add managed member */}
        <form
          onSubmit={handleAdd}
          className="lg:col-span-4 p-4 rounded-surface bg-fog/40 border border-black/[0.04] flex flex-col gap-2.5 self-start"
        >
          <span className="text-xs font-bold text-ink flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-ember" />
            Add member without an account
          </span>
          <div className="flex flex-col gap-1">
            <label htmlFor="mm-name" className="text-[11px] font-medium text-graphite">Name</label>
            <input id="mm-name" className={inputCls} placeholder="e.g. Anaya" value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="mm-rel" className="text-[11px] font-medium text-graphite">Relationship</label>
              <select id="mm-rel" className={inputCls} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option>Child</option>
                <option>Parent</option>
                <option>Sibling</option>
                <option>Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mm-open" className="text-[11px] font-medium text-graphite">Opening balance (₹)</label>
              <input id="mm-open" type="number" min="0" className={inputCls} placeholder="0" value={opening}
                onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-2 rounded-chip border border-rose-200">{error}</p>
          )}
          <Button type="submit" variant="primary" disabled={adding || !canEdit} className="h-8 text-xs font-semibold">
            <Plus className="h-3.5 w-3.5" />
            <span>{adding ? "Adding..." : "Add to Household"}</span>
          </Button>
          {!canEdit && <p className="text-[11px] text-pewter">Viewers can&apos;t add members.</p>}
        </form>

        {/* Member selector + ledger */}
        <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Household members">
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                role="tab"
                aria-selected={selected === m.user_id}
                onClick={() => setSelected(m.user_id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                  selected === m.user_id
                    ? "bg-ink text-white border-ink"
                    : "bg-white text-graphite border-mist hover:border-ink"
                }`}
              >
                {m.display_name}
                {m.is_managed && m.relationship ? ` · ${m.relationship}` : ""}
              </button>
            ))}
          </div>

          {ledgerError && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-2 rounded-chip border border-rose-200">{ledgerError}</p>
          )}

          {ledger && selectedMember && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-surface bg-fog/80 border border-black/[0.04]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-pewter block">Balance</span>
                  <span className="font-display text-lg font-bold text-ink tnum">{formatCurrency(ledger.balance)}</span>
                </div>
                <div className="p-3 rounded-surface bg-fog/80 border border-black/[0.04]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-pewter block">Money in</span>
                  <span className="font-display text-lg font-bold text-emerald-700 tnum">{formatCurrency(ledger.total_in)}</span>
                </div>
                <div className="p-3 rounded-surface bg-fog/80 border border-black/[0.04]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-pewter block">Spent</span>
                  <span className="font-display text-lg font-bold text-rose-700 tnum">{formatCurrency(ledger.total_out)}</span>
                </div>
              </div>

              {managedSelected ? (
                canEdit && (
                  <form onSubmit={handleRecord} className="p-3 rounded-surface bg-fog/40 border border-black/[0.04] grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                    <div className="col-span-2 sm:col-span-4 flex flex-col gap-1">
                      <label htmlFor="tx-desc" className="text-[11px] font-medium text-graphite">Description</label>
                      <input id="tx-desc" className={inputCls} placeholder="e.g. School fees" value={merchant}
                        onChange={(e) => setMerchant(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label htmlFor="tx-amt" className="text-[11px] font-medium text-graphite">Amount (₹)</label>
                      <input id="tx-amt" type="number" min="0" className={inputCls} value={amount}
                        onChange={(e) => setAmount(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label htmlFor="tx-dir" className="text-[11px] font-medium text-graphite">Type</label>
                      <select id="tx-dir" className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
                        <option value="out">Spent</option>
                        <option value="in">Received</option>
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-2 flex flex-col gap-1">
                      <label htmlFor="tx-cat" className="text-[11px] font-medium text-graphite">Category</label>
                      <select id="tx-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" variant="secondary" disabled={saving} className="col-span-2 sm:col-span-2 h-8 text-xs font-semibold">
                      <Receipt className="h-3.5 w-3.5" />
                      <span>{saving ? "Saving..." : "Record"}</span>
                    </Button>
                  </form>
                )
              ) : (
                <p className="text-[11px] text-pewter flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Read-only view of {selectedMember.display_name}&apos;s transactions. They manage their own account.
                </p>
              )}

              <div className="overflow-x-auto">
                {ledger.transactions.length === 0 ? (
                  <p className="text-xs text-pewter py-4">No transactions yet.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-black/[0.06] text-pewter font-semibold uppercase text-[10px] tracking-wider">
                        <th className="pb-2">Description</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {ledger.transactions.slice(0, 25).map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5 font-semibold text-ink">{t.merchant}</td>
                          <td className="py-2.5">
                            <Chip tone="neutral" className="text-[10px]">{categoryLabel(String(t.category))}</Chip>
                          </td>
                          <td className="py-2.5 text-pewter">{formatDate(t.date)}</td>
                          <td className={`py-2.5 text-right font-bold tnum ${t.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                            {t.amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(t.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
