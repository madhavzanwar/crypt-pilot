/** Window events for the credits UI. Plain DOM events so any page can fire them without importing React state. */
export const CREDITS_CHANGED_EVENT = "cryptpilot:credits-changed";
export const OPEN_CREDITS_EVENT = "cryptpilot:open-credits";

/** Tell every mounted balance view (pill, drawer, /credits) to refetch. Safe to call anywhere, including SSR. */
export function notifyCreditsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}
