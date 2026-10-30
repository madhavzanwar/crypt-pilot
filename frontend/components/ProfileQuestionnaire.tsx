"use client";

import { formatCurrency } from "@/components/ui/money";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { Check, ExternalLink } from "lucide-react";
import { onAuthChange } from "@/lib/firebase/auth";
import { isDemoMode, getUserId } from "@/lib/user";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";

type WorkType =
  | "student"
  | "farmer"
  | "artisan"
  | "unorganized"
  | "salaried"
  | "self-employed"
  | "homemaker"
  | "unemployed"
  | "retired"
  | "other";

type Group = "woman" | "sc-st" | "obc" | "minority" | "disability" | "none";

interface ProfileAnswers {
  age: string;
  state: string;
  work: WorkType[];
  income: string;
  groups: Group[];
}

interface SchemeMatch {
  name: string;
  reason: string;
  caveat: string;
  url: string;
}

const STORAGE_PREFIX = "finpilot:benefits_profile:v1:";
const WORK_OPTIONS: { value: WorkType; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "farmer", label: "Farmer" },
  { value: "artisan", label: "Artisan or traditional craft worker" },
  { value: "unorganized", label: "Unorganized-sector worker" },
  { value: "salaried", label: "Salaried employee" },
  { value: "self-employed", label: "Self-employed or business owner" },
  { value: "homemaker", label: "Homemaker or caregiver" },
  { value: "unemployed", label: "Seeking work" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];
const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: "woman", label: "Woman" },
  { value: "sc-st", label: "SC or ST community" },
  { value: "obc", label: "OBC community" },
  { value: "minority", label: "Minority community" },
  { value: "disability", label: "Person with a disability" },
  { value: "none", label: "None of these / prefer not to say" },
];

function findMatches(answers: ProfileAnswers): SchemeMatch[] {
  const matches: SchemeMatch[] = [];
  if (answers.work.includes("student")) {
    matches.push({
      name: "National Scholarship Portal",
      reason: `You said you are a student${answers.state ? ` in ${answers.state}` : ""}; use your reported income range${answers.groups.some((group) => group !== "none") ? " and selected eligibility filters" : ""} to check relevant central Government scholarships.`,
      caveat: "Check course, category and family-income rules; choose central schemes and verify the current notice.",
      url: "https://scholarships.gov.in/",
    });
  }
  if (answers.work.includes("farmer")) {
    matches.push({
      name: "PM-KISAN",
      reason: "You said you are a farmer; this programme may apply to eligible landholding farmer families.",
      caveat: "Land records and exclusion rules apply; this answer does not establish eligibility.",
      url: "https://pmkisan.gov.in/",
    });
  }
  if (answers.work.includes("artisan")) {
    matches.push({
      name: "PM Vishwakarma",
      reason: "You said you work in a traditional craft; the scheme supports eligible artisans in notified trades.",
      caveat: "Only specified trades and other registration conditions qualify.",
      url: "https://pmvishwakarma.gov.in/",
    });
  }
  if (answers.work.includes("unorganized") && ["18-25", "26-40"].includes(answers.age)) {
    matches.push({
      name: "Pradhan Mantri Shram Yogi Maandhan (PM-SYM)",
      reason: "Your age range and work type may fit the scheme's intended audience of unorganized workers.",
      caveat: "Age, individual monthly income, occupation, and existing pension/social-security coverage rules must be checked.",
      url: "https://maandhan.in/",
    });
  }
  if (answers.groups.some((group) => group !== "none") && !answers.work.includes("student") && matches.length < 3) {
    matches.push({
      name: "Government of India scheme directory",
      reason: "Some central benefits use community, disability or gender criteria; use your selected filters to explore possible programmes.",
      caveat: "Confirm that a scheme is run by the central Government and check its official eligibility notice.",
      url: "https://www.myscheme.gov.in/",
    });
  }
  return matches.slice(0, 3);
}

function Question({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-ink">
        <span className="mr-2 text-olive">{number}.</span>{title}
      </legend>
      {children}
    </fieldset>
  );
}

function CheckboxList<T extends string>({
  options,
  selected,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  label: string;
}) {
  function toggle(value: T) {
    if (value === "none") {
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    const withoutNone = selected.filter((item) => item !== "none");
    onChange(withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value]);
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={label}>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={checked}
            onClick={() => toggle(option.value)}
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
              checked ? "border-olive bg-tint-lime text-ink" : "border-border bg-white text-graphite hover:bg-fog"
            }`}
          >
            <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-olive bg-olive text-white" : "border-pewter"}`}>
              {checked && <Check className="size-3" aria-hidden="true" />}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const SESSION_PREFIX = "finpilot:benefits_session_closed:v1:";

export function ProfileQuestionnaire() {
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<ProfileAnswers>({
    age: "",
    state: "",
    work: [],
    income: "",
    groups: [],
  });
  const [matches, setMatches] = useState<SchemeMatch[] | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = (user: User | null) => {
      if (user) {
        setUserId(user.uid);
      } else if (isDemoMode()) {
        setUserId(getUserId() || "demo-user");
      } else {
        setUserId(null);
      }
    };
    const unsubscribe = onAuthChange(checkUser);
    if (isDemoMode()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth/demo state read on mount
      setUserId(getUserId() || "demo-user");
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form state when the user changes
    setMatches(null);
    if (!userId) {
      setOpen(false);
      return;
    }
    try {
      const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (saved && saved !== "skipped") {
        setAnswers(JSON.parse(saved));
      } else {
        setAnswers({ age: "", state: "", work: [], income: "", groups: [] });
      }
    } catch {
      setAnswers({ age: "", state: "", work: [], income: "", groups: [] });
    }

    try {
      const sessionClosed = window.sessionStorage.getItem(`${SESSION_PREFIX}${userId}`);
      setOpen(sessionClosed !== "1");
    } catch {
      setStorageWarning("This browser blocked local storage. Your answers will only be available until you leave this page.");
      setOpen(true);
    }
  }, [userId]);

  const completionMessage = matches && (matches.length === 0
    ? "We couldn't identify a strong match from these answers. Browse the Government of India's scheme directory and check its official eligibility details."
    : "These are possible leads based on your answers, not confirmed eligibility.");

  function update<K extends keyof ProfileAnswers>(key: K, value: ProfileAnswers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function finish() {
    if (!userId) return;
    const possibleMatches = findMatches(answers);
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(answers));
      window.sessionStorage.setItem(`${SESSION_PREFIX}${userId}`, "1");
      setStorageWarning(null);
    } catch {
      setStorageWarning("Couldn't save answers on this device; these suggestions will disappear when you leave.");
    }
    setMatches(possibleMatches);
  }

  function skip() {
    if (!userId) return;
    try {
      window.sessionStorage.setItem(`${SESSION_PREFIX}${userId}`, "1");
    } catch {
      setStorageWarning("Couldn't save this choice on this device. The questionnaire may appear again next time.");
    }
    setOpen(false);
  }

  function closeAndContinue() {
    if (userId) {
      try {
        window.sessionStorage.setItem(`${SESSION_PREFIX}${userId}`, "1");
      } catch {}
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] max-w-2xl overflow-y-auto p-5 sm:p-7"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-wider text-olive">Personalized scheme finder · India</p>
          <DialogTitle className="font-display text-2xl">
            {matches ? "Possible benefits to explore" : "A few details to personalize FinPilot"}
          </DialogTitle>
          <DialogDescription>
            {matches
              ? completionMessage
              : "Answer up to five optional questions to find relevant Government of India schemes. You can skip any answer; we store responses only in this browser."}
          </DialogDescription>
        </DialogHeader>

        {storageWarning && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{storageWarning}</p>}

        {matches ? (
          <div className="grid gap-3">
            {matches.length > 0 ? matches.map((match) => (
              <article key={match.name} className="grid gap-1 rounded-xl border border-border p-4">
                <a href={match.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-ink underline decoration-olive/50 underline-offset-4">
                  {match.name}<ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
                <p className="text-xs text-graphite">{match.reason}</p>
                <p className="text-xs text-graphite"><strong>Check first:</strong> {match.caveat}</p>
              </article>
            )) : (
              <p className="rounded-xl border border-border p-4 text-sm text-graphite">
                <a href="https://www.myscheme.gov.in/" target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                  Explore the Government of India scheme directory
                </a>
              </p>
            )}
            <p className="text-xs text-graphite">Always verify current eligibility, deadlines and application details on the official site.</p>
            <Button onClick={closeAndContinue}>Continue to FinPilot</Button>
          </div>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              finish();
            }}
          >
            <Question number={1} title="Which age range are you in?">
              <select
                value={answers.age}
                onChange={(event) => update("age", event.target.value)}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink"
                aria-label="Age range"
              >
                <option value="">Prefer not to say</option>
                <option value="under18">Under 18</option>
                <option value="18-25">18–25</option>
                <option value="26-40">26–40</option>
                <option value="41-59">41–59</option>
                <option value="60+">60 or older</option>
              </select>
            </Question>

            <Question number={2} title="Which Indian state or union territory do you live in? (Optional)">
              <Input value={answers.state} onChange={(event) => update("state", event.target.value)} maxLength={60} placeholder="State or union territory" />
            </Question>

            <Question number={3} title="Which best describe your current work or study? (Select all that apply)">
              <CheckboxList options={WORK_OPTIONS} selected={answers.work} onChange={(value) => update("work", value)} label="Work or study situations" />
            </Question>

            <Question number={4} title="Approximate monthly household income?">
              <select
                value={answers.income}
                onChange={(event) => update("income", event.target.value)}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink"
                aria-label="Monthly household income"
              >
                <option value="">Prefer not to say</option>
                <option value="under15000">Under {formatCurrency(15000)}</option>
                <option value="15000-30000">{formatCurrency(15000)}–{formatCurrency(30000)}</option>
                <option value="30001-75000">{formatCurrency(30001)}–{formatCurrency(75000)}</option>
                <option value="75001-150000">{formatCurrency(75001)}–{formatCurrency(150000)}</option>
                <option value="over150000">Above {formatCurrency(150000)}</option>
              </select>
            </Question>

            <Question number={5} title="Do any of these apply to you? (Select all that apply)">
              <CheckboxList options={GROUP_OPTIONS} selected={answers.groups} onChange={(value) => update("groups", value)} label="Optional eligibility groups" />
            </Question>

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={skip}>Skip for now</Button>
              <Button type="submit">Find possible schemes</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
