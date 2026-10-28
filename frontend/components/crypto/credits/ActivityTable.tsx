"use client";

import { useEffect, useState } from "react";
import { readCreditsActivity, type ActivityEntry } from "@/lib/crypto/useCredits";
import { CREDITS_CHANGED_EVENT } from "@/lib/crypto/creditsEvents";

/** Balance changes this browser has seen. The credits API exposes no ledger, so this is a local, best-effort log. */
export function ActivityTable() {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    const load = () => setRows(readCreditsActivity());
    load();
    // useCredits records after the fetch resolves, so re-read a moment after each change event
    const onChange = () => window.setTimeout(load, 800);
    window.addEventListener(CREDITS_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  return (
    <section aria-labelledby="cr-activity-h">
      <h2 id="cr-activity-h" className="mb-2 font-display text-lg font-semibold text-ink">
        Recent credit activity
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-surface border border-mist bg-white p-4 text-sm text-graphite">
          Nothing yet. Top-ups and checks show up here after your balance changes on this device.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-surface border border-mist bg-white">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Credit balance changes seen on this device</caption>
            <thead>
              <tr className="bg-fog text-left text-xs text-pewter">
                <th scope="col" className="px-4 py-2 font-medium">When</th>
                <th scope="col" className="px-4 py-2 font-medium">What</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Change</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-mist">
                  <td className="px-4 py-2 whitespace-nowrap text-graphite tabular-nums">{new Date(r.at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-ink">{r.delta > 0 ? "Credits added" : "Wallet check"}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                  <td className="px-4 py-2 text-right text-graphite tabular-nums">{r.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-pewter">Kept in this browser only, so it can miss changes made on other devices.</p>
    </section>
  );
}
