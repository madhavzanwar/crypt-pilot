"use client";

/** What to do when a completed UPI payment has to be undone. UPI payments cannot be cancelled once successful, so this lists the real routes. */
export function PaymentHelp({ payee, amount, ref, account, light }: { payee: string; amount: string; ref: string; account?: string; light?: boolean }) {
  const mute = light ? "text-[#5f6368]" : "text-graphite";
  return (
    <div className={`rounded-xl border ${light ? "border-[#dadce0]" : "border-black/[0.08]"} p-3 text-sm`}>
      <p className="font-medium">Need a refund or want to cancel?</p>
      <p className={`mt-1 text-xs ${mute}`}>A successful UPI payment cannot be cancelled from the app. These are the ways to get the money back:</p>
      <ol className={`mt-2 list-decimal space-y-1 pl-5 text-xs ${mute}`}>
        <li>Ask <b>{payee}</b> to refund {amount} to you. This is the quickest way, and they can reverse it from their side.</li>
        <li>Open your bank or UPI app, find this payment{account ? ` (paid from ${account})` : ""}, and raise a dispute with the UPI reference below.</li>
        <li>If the bank does not fix it, file a complaint in the NPCI UPI dispute redressal form (npci.org.in, UPI section).</li>
        <li>Still unresolved after 30 days: the RBI Integrated Ombudsman (cms.rbi.org.in).</li>
      </ol>
      <p className="mt-2 text-xs">UPI reference: <b className="font-mono">{ref}</b></p>
    </div>
  );
}

export const upiRef = (id: string) => id.replace(/-/g, "").slice(0, 12).toUpperCase();
