"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { useT } from "@/lib/i18n";
import type { Profile, ProfileLevel } from "@/lib/types";

const LEVELS: { id: ProfileLevel; title: string; blurb: string }[] = [
  { id: "basic", title: "Quick", blurb: "Age, who you are, earnings and savings goal. I will learn the rest from your data." },
  { id: "standard", title: "Standard", blurb: "A few more questions on income, costs and goals for sharper advice." },
  { id: "deep", title: "In depth", blurb: "Debts, investments, insurance, tax and long-term goals for the best plan." },
];

/** Pick how deep to go, answer, save. Used by the first-login dialog and the Profile page. */
export function ProfileForm({ userId, initial, onDone, onSkip }: { userId: string; initial?: Profile | null; onDone: (p: Profile) => void; onSkip?: () => void }) {
  const { t } = useT();
  const questions = useAsync(() => api.profileQuestions(), []);
  const [level, setLevel] = useState<ProfileLevel | null>(initial?.level && initial.level !== "skipped" ? initial.level : "basic");
  const [answers, setAnswers] = useState<Record<string, string>>(initial?.answers ?? {});
  const [saving, setSaving] = useState(false);
  const list = (level ? questions.data?.[level] ?? [] : []).filter((q) => !q.when || answers[q.when.id] === q.when.equals);

  async function save() {
    if (!level) return;
    setSaving(true);
    try {
      onDone(await api.saveProfile(userId, level, answers));
      toast.success("Saved. FinPilot will use this to personalise its answers.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLevel(l.id)}
            className={cn("rounded-2xl border p-3 text-left transition", level === l.id ? "border-olive bg-tint-lime" : "border-mist bg-white hover:bg-fog")}
          >
            <p className="text-sm font-semibold text-ink">{l.title}</p>
            <p className="mt-1 text-xs text-graphite">{l.blurb}</p>
          </button>
        ))}
      </div>

      {level && (
        <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
          {questions.loading && <p className="text-sm text-pewter">Loading questions…</p>}
          {list.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <p className="text-sm font-medium text-ink">{t(`q.${q.id}`, q.label)}</p>
              {q.type === "choice" ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                      className={cn("rounded-full border px-3 py-1 text-xs", answers[q.id] === o ? "border-olive bg-lime text-ink" : "border-mist bg-white text-graphite hover:bg-fog")}
                    >
                      {t(`o.${o}`, o)}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  type={q.type === "number" ? "number" : "text"}
                  inputMode={q.type === "number" ? "decimal" : undefined}
                  min={q.type === "number" ? 0 : undefined}
                  placeholder={q.hint}
                  aria-label={t(`q.${q.id}`, q.label)}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {onSkip ? <Button variant="ghost" onClick={onSkip}>{t("ob.skip")}</Button> : <span />}
        <Button onClick={save} disabled={!level || saving}>
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} {t("ob.save")}
        </Button>
      </div>
    </div>
  );
}
