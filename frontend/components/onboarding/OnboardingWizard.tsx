"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { LANGS, setLang, useT } from "@/lib/i18n";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import type { Profile } from "@/lib/types";

/** First-login questionnaire: language first, then one question per screen. Answers shape the dashboard (simple view, role plan). */
export function OnboardingWizard({ userId, onDone, onSkip }: { userId: string; onDone: (p: Profile) => void; onSkip: () => void }) {
  const { lang, t } = useT();
  const questions = useAsync(() => api.profileQuestions(), []);
  const [step, setStep] = useState(0); // 0 = language, then one step per question
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const list = (questions.data?.basic ?? []).filter((q) => !q.when || answers[q.when.id] === q.when.equals);
  const q = list[step - 1];
  const last = step === list.length;

  async function save() {
    setSaving(true);
    try {
      onDone(await api.saveProfile(userId, "basic", answers));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }
  const next = () => (last ? save() : setStep((s) => s + 1));
  const pick = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (!last) setTimeout(() => setStep((s) => s + 1), 180);
  };

  return (
    <div className="space-y-6">
      <div className="h-1.5 overflow-hidden rounded-full bg-fog">
        <div className="h-full rounded-full bg-lime-dark/70 transition-[width] duration-300" style={{ width: `${list.length ? (step / list.length) * 100 : 0}%` }} />
      </div>

      <div key={step} className="min-h-52 animate-in fade-in slide-in-from-right-2 duration-300">
        {step === 0 || !q ? (
          <div className="space-y-4">
            <p className="font-display text-xl font-semibold text-ink">Choose your language · अपनी भाषा चुनें · तुमची भाषा निवडा</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => { setLang(l.code); setStep(1); }}
                  className={cn("flex items-center justify-between rounded-2xl border p-4 text-lg font-medium transition", lang === l.code ? "border-olive bg-tint-lime" : "border-mist bg-white hover:bg-fog")}
                >
                  {l.native}
                  {lang === l.code && <Check className="size-4 text-olive" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-pewter">{step} / {list.length}</p>
            <p className="font-display text-xl font-semibold text-ink">{t(`q.${q.id}`, q.label)}</p>
            {q.type === "choice" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => pick(q.id, o)}
                    className={cn("rounded-2xl border p-3 text-left text-sm transition", answers[q.id] === o ? "border-olive bg-lime text-ink" : "border-mist bg-white text-graphite hover:bg-fog")}
                  >
                    {t(`o.${o}`, o)}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                autoFocus
                type={q.type === "number" ? "number" : "text"}
                inputMode={q.type === "number" ? "decimal" : undefined}
                min={q.type === "number" ? 0 : undefined}
                placeholder={q.hint}
                aria-label={t(`q.${q.id}`, q.label)}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && next()}
                className="h-12 text-base"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onSkip}>{t("ob.skip")}</Button>
        {step > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} aria-label={t("ob.back")}>
              <ArrowLeft className="size-4" />
            </Button>
            <Button onClick={next} disabled={saving || !q}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {last ? t("ob.save") : t("ob.next")} {!last && <ArrowRight className="ml-1 size-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
