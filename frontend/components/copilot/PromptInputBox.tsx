"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 200;

/** Rounded, auto-growing prompt box: Enter sends, Shift+Enter adds a line. */
export function PromptInputBox({
  value,
  onChange,
  onSend,
  isLoading = false,
  placeholder,
  footer,
  actions,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  placeholder?: string;
  footer?: React.ReactNode;
  /** Extra controls (the mic) shown just before the send button. */
  actions?: React.ReactNode;
  /** Lets the page focus the box, e.g. after a prompt chip prefills it. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const hasContent = value.trim() !== "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // empty: the placeholder can measure tall before layout settles, so keep the one-row min height
    if (!value) return;
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value, ref]);

  return (
    <div
      className={cn(
        "rounded-3xl border border-black/[0.1] bg-white p-2 shadow-[0_8px_30px_rgba(95,127,12,0.12)] transition-all duration-300 focus-within:border-lime-dark",
        isLoading && "border-lime-dark/70"
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={isLoading}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (hasContent && !isLoading) onSend();
          }
        }}
        className="flex min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-pewter disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0 px-2 text-[11px] text-pewter">{footer}</div>
        <div className="flex shrink-0 items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={onSend}
          disabled={isLoading || !hasContent}
          aria-label={isLoading ? "Generating answer" : "Send message"}
          title={isLoading ? "Generating answer" : "Send message"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
            hasContent || isLoading ? "bg-lime text-ink hover:bg-lime-dark" : "bg-fog text-pewter"
          )}
        >
          {isLoading ? <Square className="size-4 animate-pulse fill-current" /> : <ArrowUp className="size-4" />}
        </button>
        </div>
      </div>
    </div>
  );
}
