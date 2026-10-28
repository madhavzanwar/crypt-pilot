"use client";

import { flash, glideTo } from "@/lib/voice";

export type VoiceAction = ({ type: "navigate"; path: string } | { type: "scroll"; to: string } | { type: "click"; id: number; label?: string } | { type: "fill"; field: string; value: string }) & { note?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DANGEROUS = /delete|remove|pay\b|send|submit|confirm|disconnect|sign.?out|log.?out|clear|reset|transfer|unlink|revoke/i; // the voice agent never presses these
const label = (el: Element) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
const FIELDS = "input:not([type=password]):not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),textarea,select";
const fieldLabel = (el: Element) =>
  ((el as HTMLInputElement).labels?.[0]?.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);

/** What the user can currently see: headings, pressable controls (numbered on the page) and the main text. */
export function snapshotScreen() {
  document.querySelectorAll("[data-voice-id]").forEach((e) => e.removeAttribute("data-voice-id"));
  const main = document.querySelector("main") ?? document.body;
  const seen = new Set<string>();
  const controls: { id: number; label: string }[] = [];
  main.querySelectorAll("a[href],button,[role=tab]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const l = label(el);
    if (!r.width || !r.height || !l || seen.has(l) || controls.length >= 50) return;
    seen.add(l);
    const id = controls.length + 1;
    el.setAttribute("data-voice-id", String(id));
    controls.push({ id, label: l });
  });
  const fields = [...main.querySelectorAll(FIELDS)].filter((el) => (el as HTMLElement).offsetParent && fieldLabel(el)).slice(0, 20)
    .map((el) => ({ label: fieldLabel(el), type: (el as HTMLInputElement).type || "text", value: ((el as HTMLInputElement).value || "").slice(0, 40) }));
  return {
    fields,
    title: document.title.slice(0, 120),
    headings: [...main.querySelectorAll("h1,h2,h3")].map((h) => (h.textContent ?? "").trim().slice(0, 80)).filter(Boolean).slice(0, 30),
    controls,
    text: ((main as HTMLElement).innerText ?? "").replace(/\n{2,}/g, "\n").slice(0, 2500),
  };
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

/** Types into a form field the way a person would, so React sees the change. Dates must be YYYY-MM-DD. Returns false if the field is not there. */
function fillField(want: string, value: string): boolean {
  const w = norm(want);
  const main = document.querySelector("main") ?? document.body;
  const el = [...main.querySelectorAll(FIELDS)].find((e) => (e as HTMLElement).offsetParent && norm(fieldLabel(e)).includes(w)) as HTMLInputElement | HTMLSelectElement | undefined;
  if (!el) return false;
  let v = value;
  if (el instanceof HTMLSelectElement) {
    const opt = [...el.options].find((o) => norm(o.text).includes(norm(value)) || norm(o.value) === norm(value));
    if (!opt) return false;
    v = opt.value;
  }
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  flash(el);
  return true;
}

/** Finds what the user means on the current page: a heading first, then a control, then any text block. */
function findOnPage(want: string): Element | null {
  const w = norm(want);
  if (!w) return null;
  const main = document.querySelector("main") ?? document.body;
  const byText = (els: Iterable<Element>) => [...els].find((e) => norm(e.textContent ?? "").includes(w));
  const hit = byText(main.querySelectorAll("h1,h2,h3,h4,h5,legend,[role=heading]")) ?? byText(main.querySelectorAll("a,button,label,th,[role=tab]"));
  if (hit) return hit;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (norm(n.nodeValue ?? "").includes(w) && n.parentElement) return n.parentElement.closest("li,tr,article,section,div") ?? n.parentElement;
  }
  return null;
}

/** Does what the voice agent decided, one step at a time. `onStep` tells the user what is happening and whether it worked. */
export async function runActions(actions: VoiceAction[], push: (path: string) => void, onStep: (text: string, done: boolean) => void = () => {}) {
  for (const a of actions) {
    if (a.type === "navigate") {
      onStep(a.note || `Opening ${a.path.slice(1)}…`, false);
      push(a.path);
      const end = Date.now() + 6000;
      while (!location.pathname.startsWith(a.path) && Date.now() < end) await sleep(100);
      await sleep(1200); // let the new page fill in
      onStep(a.note || `Opened ${a.path.slice(1)}`, true);
    } else if (a.type === "fill") {
      onStep(a.note || `Filling in ${a.field}…`, false);
      await sleep(500);
      onStep(fillField(a.field, a.value) ? a.note || `${a.field}: ${a.value}` : `Could not find the "${a.field}" field`, true);
      await sleep(300);
    } else if (a.type === "scroll") {
      onStep(a.note || `Scrolling to ${a.to}…`, false);
      const dir = a.to.toLowerCase();
      if (/^(top|bottom|up|down)$/.test(dir)) {
        glideTo(dir === "top" ? 0 : dir === "bottom" ? document.documentElement.scrollHeight : window.scrollY + (dir === "up" ? -1 : 1) * window.innerHeight * 0.8);
        await sleep(900);
        onStep(a.note || `Scrolled ${dir}`, true);
      } else {
        const el = findOnPage(a.to);
        if (el) {
          flash(el);
          await sleep(1100);
          onStep(a.note || `Scrolled to ${a.to}`, true);
        } else {
          onStep(`Could not find "${a.to}" on this page`, true);
        }
      }
    } else {
      snapshotScreen(); // ids from before a page change are stale: match the button by its label instead
      const want = norm(a.label ?? "");
      const el = [...document.querySelectorAll("[data-voice-id]")].find((e) => norm(label(e)) === want) ?? null;
      if (!el) {
        onStep(`Could not find the "${a.label}" button`, true);
        continue;
      }
      if (DANGEROUS.test(label(el))) {
        onStep(`I will not press "${label(el)}" by voice, please do it yourself`, true);
        continue;
      }
      onStep(a.note || `Pressing "${label(el)}"…`, false);
      flash(el);
      await sleep(1100);
      (el as HTMLElement).click();
      await sleep(800);
      onStep(a.note || `Pressed "${label(el)}"`, true);
    }
  }
}
