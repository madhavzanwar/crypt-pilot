import { OPEN_CREDITS_EVENT } from "@/lib/crypto/creditsEvents";

let hosts = 0;

/** Called by CreditsPill while mounted, so openCreditsDrawer() knows a drawer exists to listen. */
export function registerCreditsHost(): () => void {
  hosts += 1;
  return () => {
    hosts = Math.max(0, hosts - 1);
  };
}

/**
 * Open the credits drawer from anywhere (e.g. after a wallet check returns 402 `no_credits`).
 * Dispatches the `cryptpilot:open-credits` window event. If no CreditsPill is mounted on this page, goes to /credits instead.
 */
export function openCreditsDrawer(): void {
  if (typeof window === "undefined") return;
  if (hosts > 0) window.dispatchEvent(new Event(OPEN_CREDITS_EVENT));
  // plain helper: no router outside React
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- plain helper, no router available outside React
  else window.location.href = "/credits";
}
