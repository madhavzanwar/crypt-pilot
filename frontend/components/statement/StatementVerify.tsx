"use client";

import { HashLine } from "@/components/crypto/web3/Bits";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";
import { compareStatementHash, type HashVerdict } from "./auditHashVerify";

const inputCls =
  "min-h-11 w-full rounded-chip border border-mist bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy";

/**
 * "Verify a statement hash": recomputes the SHA-256 of the statement's canonical JSON (the very `recomputedHex` the
 * page prints) and compares it with the pasted value. Same algorithm and same input as the printed hash, so the
 * printed value always matches. Needs no wallet and no network.
 */
export function StatementVerify({ recomputedHex }: { recomputedHex: string }) {
  const { t } = useT();
  const id = useId();
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<HashVerdict | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  const run = () => {
    setVerdict(compareStatementHash(input, recomputedHex));
    setShown(recomputedHex);
  };

  const tone =
    verdict === "match"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : verdict === "mismatch"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-amber-200 bg-amber-50 text-amber-900";
  const word =
    verdict === "match"
      ? t("stmt.verify.match", "Match")
      : verdict === "mismatch"
        ? t("stmt.verify.mismatch", "Does not match")
        : t("stmt.verify.invalid", "Not a hash");
  const note =
    verdict === "match"
      ? t("stmt.verify.matchNote", "The hash you entered equals the SHA-256 recomputed from the figures on this page.")
      : verdict === "mismatch"
        ? t("stmt.verify.mismatchNote", "The hash you entered differs from the SHA-256 recomputed from the figures on this page.")
        : t("stmt.verify.invalidNote", "Enter a SHA-256 hash: 64 hex digits, with or without a 0x or SHA256: prefix.");

  return (
    <div className="flex flex-col gap-3 border-t border-mist pt-4">
      <h4 className="text-sm font-semibold text-ink">{t("stmt.verify.heading", "Verify a statement hash")}</h4>
      <p className="text-xs text-graphite">
        {t(
          "stmt.verify.intro",
          "Recompute the SHA-256 of this statement's figures in your browser and compare it with a hash you paste. Nothing here needs a wallet.",
        )}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-ink">
          {t("stmt.verify.field", "Statement hash (SHA-256)")}
        </label>
        <input
          id={id}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setVerdict(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="0x… or SHA256:…"
          spellCheck={false}
          autoComplete="off"
          className={inputCls}
        />
      </div>
      <div>
        <Button variant="secondary" size="sm" onClick={run}>
          {t("stmt.verify.button", "Verify")}
        </Button>
      </div>
      <div aria-live="polite">
        {verdict && verdict !== "empty" && (
          <p className={cn("flex flex-col gap-1 rounded-xl border px-3.5 py-2.5 text-xs", tone)}>
            <span className="font-semibold">{word}</span>
            <span className="leading-relaxed">{note}</span>
          </p>
        )}
      </div>
      {shown && <HashLine label={t("stmt.verify.recomputed", "SHA-256 (recomputed)")} value={shown} full />}
    </div>
  );
}
