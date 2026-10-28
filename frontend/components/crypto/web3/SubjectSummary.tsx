"use client";

import { useT } from "@/lib/i18n";
import type { AttestSubject } from "@/lib/crypto/eas/subject";
import { useEffect, useState } from "react";
import { HashLine } from "./Bits";

/**
 * The exact data that would be published, plus the hashes recomputed in the browser from it. Hashes appear a
 * moment after mount (keccak is loaded on demand so the host page stays light).
 */
export function SubjectSummary({ subject }: { subject: AttestSubject }) {
  const { t } = useT();
  const [state, setState] = useState<{
    subject: AttestSubject;
    hashes: { label: string; hash: string }[] | null;
  } | null>(null);
  const current = state?.subject === subject ? state : null;
  const hashes = current?.hashes ?? null;
  const [failed, setFailed] = useState<AttestSubject | null>(null);
  const error = failed === subject;

  useEffect(() => {
    let live = true;
    import("@/lib/crypto/eas/keccak")
      .then(({ keccakUtf8 }) => {
        if (live) setState({ subject, hashes: subject.candidates(keccakUtf8) });
      })
      .catch(() => {
        if (live) setFailed(subject);
      });
    return () => {
      live = false;
    };
  }, [subject]);

  return () => {
      live = false;
    };
  }, [subject]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-mist bg-fog/60 p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-pewter">
        {t("web3.summary.title", "What will be published")}
      </p>
      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[max-content_1fr]">
        {subject.rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-graphite">{r.label}</dt>
            <dd className={r.mono ? "break-all font-mono text-ink" : "font-medium text-ink"}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1.5">
        {hashes?.map((h) => <HashLine key={h.label} label={h.label} value={h.hash} full />)}
        {!hashes && !error && <p className="text-xs text-pewter">{t("web3.summary.hashing", "Computing hashes…")}</p>}
        {error && <p className="text-xs text-rose-700">{t("web3.summary.hashError", "Could not compute the hashes in this browser.")}</p>}
      </div>
      <p className="text-xs text-graphite">{subject.privacyNote}</p>
    </div>
  );
}
