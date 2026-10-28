import type { CopilotInsight } from "./types";

const EVT = "copilot:insights";
const OPEN = "copilot:open-assistant";

/** Opens the floating assistant and starts listening (call from a click so the browser allows the mic). */
export function openAssistant() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN));
}

export function onOpenAssistant(fn: () => void): () => void {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
}

export function publishCopilotInsights(insights: CopilotInsight[]) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT, { detail: insights }));
}

export function subscribeCopilotInsights(fn: (i: CopilotInsight[]) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<CopilotInsight[]>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
