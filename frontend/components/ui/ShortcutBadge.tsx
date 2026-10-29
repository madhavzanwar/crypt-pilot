"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { isApplePlatform, shortcutLabel } from "@/components/ui/shortcut";

const subscribe = () => () => {};
const clientIsApple = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return isApplePlatform(nav.userAgentData?.platform || nav.platform, nav.userAgent);
};

/** "Ctrl K" on Windows/Linux, "⌘ K" on macOS/iOS. Starts with Ctrl (server render) and switches after mount. */
export function ShortcutBadge({ className }: { className?: string }) {
  const apple = useSyncExternalStore(subscribe, clientIsApple, () => false);
  const { keys } = shortcutLabel(apple);
  return (
    <kbd
      data-testid="shortcut-badge"
      className={cn(
        "ml-auto inline-flex items-center gap-1 rounded-md border border-mist bg-fog px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-carbon",
        className,
      )}
    >
      {keys.map((k) => (
        <span key={k}>{k}</span>
      ))}
    </kbd>
  );
}
