"use client";

import { useCryptoT as useT } from "@/lib/crypto/i18n";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * Four numbered steps (Connect -> Switch network -> Sign -> Done). `current` is the 0-based index of the step to
 * do next (4 = all done). Done = Ink + check, current = Ember outline, upcoming = Fog. Vertical on narrow
 * containers, horizontal from 540px of container width.
 */
export function AttestStepper({ current, className }: { current: number; className?: string }) {
  const { t } = useT();
  const steps = [
    t("web3.step.connect", "Connect"),
    t("web3.step.network", "Switch network"),
    t("web3.step.sign", "Sign"),
    t("web3.step.done", "Done"),
  ];
  return (
    <div className={cn("@container", className)}>
      <ol
        aria-label={t("web3.steps.aria", "Attestation steps")}
        className="flex flex-col gap-3 @[540px]:flex-row @[540px]:items-center @[540px]:gap-0"
      >
        {steps.map((label, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li
              key={label}
              aria-current={now ? "step" : undefined}
              className="flex items-center gap-2.5 @[540px]:flex-1 @[540px]:last:flex-none"
            >
              <span
                className={cn(
                  "inline-flex size-8 flex-none items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-200",
                  done && "border-ink bg-ink text-paper",
                  now && "border-ember bg-orange-50 text-ember-dark",
                  !done && !now && "border-mist bg-fog text-pewter",
                )}
              >
                {done ? <Check className="size-4" aria-hidden strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={cn("text-sm", done || now ? "font-medium text-ink" : "text-pewter")}>{label}</span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 @[540px]:mx-3 @[540px]:block",
                    done ? "bg-ink" : "bg-mist",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
