"use client";

import { useState } from "react";
import { Plus, Wallet, X } from "lucide-react";
import { shortAddress, validateAddress } from "@/lib/crypto/address/validate";
import { looksLikeSecret } from "@/lib/crypto/address/seedGuard";
import { MAX_WALLETS } from "./types";

const REASON = {
  empty: "Paste a wallet address first.",
  format: "That does not look like a Bitcoin address (it starts with 1, 3 or bc1).",
  mixed_case: "Mixed-case bc1 addresses are invalid. Copy the address again.",
  checksum: "The address checksum does not match: there is probably a typo. Copy it again.",
} as const;

/** "Crypto wallets to screen": up to five public addresses for the Chain Analyst. Seed phrases and keys are refused and cleared. */
export default function WalletsInput({ wallets, onChange, disabled, id = "wallets" }: { wallets: string[]; onChange: (w: string[]) => void; disabled?: boolean; id?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (looksLikeSecret(text)) {
      setText("");
      setError("Never share your seed phrase or private key. That text was cleared and not saved.");
      return;
    }
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length === 0) return setError(REASON.empty);
    if (tokens.some(looksLikeSecret)) {
      setText("");
      return setError("Never share your seed phrase or private key. That text was cleared and not saved.");
    }
    const next = [...wallets];
    for (const t of tokens) {
      const c = validateAddress(t, { allowDemo: true });
      if (!c.ok) return setError(REASON[c.reason]);
      if (next.includes(c.address)) continue;
      if (next.length >= MAX_WALLETS) return setError(`You can screen up to ${MAX_WALLETS} wallets. Remove one first.`);
      next.push(c.address);
    }
    onChange(next);
    setText("");
    setError(null);
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Wallet className="size-4 text-leaf" /> Crypto wallets to screen
        <span className="text-xs font-normal text-pewter">{wallets.length}/{MAX_WALLETS}</span>
      </label>
      <p className="text-xs text-graphite">
        Optional. Add Bitcoin wallets you pay or hold and the Chain Analyst joins the council. Only public addresses are sent for the check; never paste a seed phrase or private key.
      </p>
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="bc1q… or 1… or 3…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-9 min-w-0 flex-1 rounded-md border border-mist bg-white px-3 font-mono text-xs text-ink outline-none placeholder:text-pewter focus-visible:ring-[3px] focus-visible:ring-lime/60 disabled:opacity-50"
        />
        <button type="button" onClick={add} disabled={disabled || wallets.length >= MAX_WALLETS} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-mist bg-white px-3 text-sm text-ink hover:bg-fog disabled:opacity-50">
          <Plus className="size-4" /> Add
        </button>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-rose-700">{error}</p>}
      {wallets.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {wallets.map((w) => (
            <li key={w} className="inline-flex items-center gap-1.5 rounded-full bg-fog py-1 pl-3 pr-1 font-mono text-xs text-ink" title={w} translate="no" lang="en">
              {shortAddress(w, 8, 6)}
              <button type="button" disabled={disabled} onClick={() => onChange(wallets.filter((x) => x !== w))} aria-label={`Remove ${shortAddress(w)}`} className="flex size-5 items-center justify-center rounded-full text-pewter hover:bg-white hover:text-ink">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-pewter">Add a wallet to screen. Without one, the Chain Analyst sits this out and the other specialists run as usual.</p>
      )}
    </div>
  );
}
