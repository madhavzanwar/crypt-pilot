"use client";

import { Check, Loader2 } from "lucide-react";
import type { StepEvent } from "@/lib/crypto/api";
import { STEP_IDS, activeStepIndex } from "@/lib/crypto/useWalletCheck";
import { cn } from "@/lib/utils";
import { useGuardT } from "./copy";

/** The five check steps (validate, graph, hops, score, explain), driven by the SSE `step` events. */
export default function ProgressSteps({ steps, className }: { steps: StepEvent[]; className?: string }) {
  const { g } = useGuardT();
  const active = activeStepIndex(steps);
  return (
    <ol aria-label={g("wg.progress.aria")} className={cn("grid gap-3", className)}>
      {STEP_IDS.map((id, i) => {
        const done = i < active;
        const current = i === active || (active === -1 && i === 0);
        return (
          <li
            key={id}
            aria-current={current ? "step" : undefined}
            className={cn("flex items-center gap-3 text-sm", !done && !current && "text-pewter")}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-6 flex-none items-center justify-center rounded-full border",
                done ? "border-ink bg-ink text-white" : current ? "border-ember text-ember-dark" : "border-black/[0.12]",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : current ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
            </span>
            <span className={cn(current && "font-semibold text-ink", done && "text-graphite")}>{g(`wg.step.${id}`)}</span>
            <span className="sr-only">{done ? "done" : current ? "in progress" : "pending"}</span>
          </li>
        );
      })}
    </ol>
  );
}
