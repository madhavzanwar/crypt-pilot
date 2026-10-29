"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { stripProtected, toAsciiDigits, toDevanagariDigits } from "@/components/translateGuard";

const ATTRS = ["placeholder", "aria-label", "title"] as const;
// translate="no" (the HTML standard) marks hashes, addresses and ids: never translated, never digit-converted.
const SKIP = "script,style,code,pre,textarea,input,select,option,svg,[data-no-translate],[translate='no'],.notranslate,[contenteditable='true']";
const SKIP_DIGITS = "script,style,code,pre,textarea,input,select,option,[data-no-translate],[translate='no'],.notranslate,[contenteditable='true']"; // svg chart labels get Indic digits too
const toDev = toDevanagariDigits; // Hindi and Marathi share the Devanagari numerals; hex/0x/bc1/UUID/PAN-like tokens are left alone
const toAscii = toAsciiDigits;
const NEEDS_TRANSLATION = /[A-Za-z]{2}/;

/**
 * Safety net for text that has no hand-written translation: transaction data, backend sentences, any untranslated label.
 * Hand-written strings (useT) are already Hindi/Marathi so they are skipped; everything else is sent in small cached
 * batches to /api/translate and swapped into the page in place. Switching back to English restores the original text.
 */
export function AutoTranslate() {
  const lang = useLang();

  useEffect(() => {
    if (lang === "en") return;
    const KEY = `finpilot_tr_${lang}`;
    let cache: Record<string, string> = {};
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {}

    type Slot = { el: Text | Element; attr?: string };
    const original = new Map<Slot["el"], Map<string, { en: string; tr: string }>>(); // node/element -> attr ("" = text) -> record
    const pending = new Map<string, Slot[]>(); // english text -> places waiting for it
    let timer: ReturnType<typeof setTimeout> | undefined;
    let applying = false;
    let stopped = false;

    const read = (s: Slot) => (s.attr ? (s.el as Element).getAttribute(s.attr) : (s.el as Text).nodeValue) ?? "";
    const write = (s: Slot, v: string) => (s.attr ? (s.el as Element).setAttribute(s.attr, v) : ((s.el as Text).nodeValue = v));

    function remember(s: Slot, en: string, tr: string) {
      const m = original.get(s.el) ?? new Map();
      m.set(s.attr ?? "", { en, tr });
      original.set(s.el, m);
    }

    function consider(s: Slot) {
      const raw = read(s);
      const rec = original.get(s.el)?.get(s.attr ?? "");
      if (rec && raw === rec.tr) return; // already our translation
      const ascii = toAscii(raw);
      const en = ascii.trim();
      if (!en) return;
      const el = s.attr ? (s.el as Element) : (s.el as Text).parentElement;
      const wantsWords = NEEDS_TRANSLATION.test(stripProtected(en)) && !el?.closest(SKIP);
      const hit = wantsWords ? cache[en] : undefined;
      if (hit) {
        const lead = ascii.slice(0, ascii.indexOf(en)), trail = ascii.slice(ascii.indexOf(en) + en.length);
        const out = toDev(lead + hit + trail);
        remember(s, raw, out);
        write(s, out);
        return;
      }
      const devRaw = toDev(raw);
      if (devRaw !== raw) {
        remember(s, raw, devRaw);
        write(s, devRaw);
      }
      if (wantsWords) pending.set(en, [...(pending.get(en) ?? []), s]);
    }

    function scan(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!(root.parentElement?.closest(SKIP_DIGITS))) consider({ el: root as Text });
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const rootEl = root as Element;
      if (rootEl.closest(SKIP_DIGITS)) return;
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement?.closest(SKIP_DIGITS)) consider({ el: n as Text });
      }
      const withAttrs = [rootEl, ...rootEl.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))];
      for (const el of withAttrs) {
        if (el.closest(SKIP_DIGITS) && !(el.tagName === "INPUT" && el.hasAttribute("placeholder"))) continue;
        for (const a of ATTRS) if (el.hasAttribute(a)) consider({ el, attr: a });
      }
    }

    async function flush() {
      timer = undefined;
      const todo = [...pending.keys()].filter((t) => !(t in cache));
      const jobs = new Map(pending);
      pending.clear();
      for (let i = 0; i < todo.length && !stopped; i += 60) {
        try {
          const { translations } = await api.translateTexts(lang, todo.slice(i, i + 60));
          Object.assign(cache, translations);
        } catch {} // offline or no key: the page just stays English
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(cache));
      } catch {}
      if (stopped) return;
      applying = true;
      for (const [en, slots] of jobs) {
        const tr = cache[en];
        if (!tr) continue;
        for (const s of slots) {
          const raw = read(s), ascii = toAscii(raw);
          if (!ascii.includes(en)) continue; // React changed it meanwhile; the observer will pick up the new text
          const out = toDev(ascii.replace(en, tr));
          remember(s, original.get(s.el)?.get(s.attr ?? "")?.en ?? raw, out);
          write(s, out);
        }
      }
      applying = false;
    }

    function schedule() {
      if (!timer && pending.size) timer = setTimeout(flush, 200);
    }

    scan(document.body);
    schedule();

    const observer = new MutationObserver((records) => {
      if (applying) return;
      for (const r of records) {
        if (r.type === "characterData") scan(r.target);
        else if (r.type === "attributes") consider({ el: r.target as Element, attr: r.attributeName! });
        else r.addedNodes.forEach(scan);
      }
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

    return () => {
      stopped = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      // back to English: put every original string back
      for (const [el, attrs] of original) {
        for (const [attr, rec] of attrs) {
          if (!(el as Node).isConnected) continue;
          if (attr) (el as Element).setAttribute(attr, rec.en);
          else (el as Text).nodeValue = rec.en;
        }
      }
    };
  }, [lang]);

  return null;
}
