"use client";

import { useEffect } from "react";
import { hasAmount } from "@/components/ui/money";
import { MASK, maskAmounts } from "@/components/ui/maskAmounts";

const STYLE_ID = "fp-privacy-mask-style";
const SKIP = "script,style,noscript,textarea,input,select,option,[data-no-mask]";

/**
 * Privacy mode ("hide amounts"). The stylesheet only blurs `.tnum`, which many amounts do not carry, so this scans
 * the page for text that looks like money (a currency symbol or code next to digits) and marks its element
 * `data-amount`, blurs it and REPLACES the amount text with a mask (the original is kept in memory and restored when
 * privacy mode is switched off), so the figures are gone from the DOM, copy/paste and screen readers too. New and changed text is picked up by a MutationObserver.
 */
export function PrivacyMask({ active }: { active: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.classList.remove("hide-amounts");
      return;
    }
    root.classList.add("hide-amounts");
    const originals = new Map<Text, string>();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = ".hide-amounts [data-amount]{filter:blur(7px);user-select:none}";
      document.head.appendChild(style);
    }

    const mark = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const el = node.parentElement;
        const value = node.nodeValue ?? "";
        if (el && !el.closest(SKIP) && hasAmount(value)) {
          el.setAttribute("data-amount", "1");
          const masked = maskAmounts(value);
          if (masked !== value) {
            originals.set(node as Text, value);
            node.nodeValue = masked;
          }
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (el.closest(SKIP)) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) mark(n);
    };

    let queue: Node[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const todo = queue;
      queue = [];
      for (const n of todo) if (n.isConnected) mark(n);
    };
    const enqueue = (n: Node) => {
      queue.push(n);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    mark(document.body);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") enqueue(r.target);
        else r.addedNodes.forEach(enqueue);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      originals.forEach((v, n) => {
        if (n.isConnected && (n.nodeValue ?? "").includes(MASK)) n.nodeValue = v;
      });
      originals.clear();
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove("hide-amounts");
      document.querySelectorAll("[data-amount]").forEach((e) => e.removeAttribute("data-amount"));
    };
  }, [active]);

  return null;
}
