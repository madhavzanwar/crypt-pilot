"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildUpiUri } from "@/lib/upi";
import { cn } from "@/lib/utils";

// Demo merchants to scan with the phone app at /pay. Any real UPI QR works too: the app only reads it, it never pays a bank.
const MERCHANTS = [
  { name: "Sharma Tea Stall", upiId: "sharmatea@demo", amount: 40 },
  { name: "Fresh Basket Grocery", upiId: "freshbasket@demo", amount: 640 },
  { name: "Swiggy Instamart", upiId: "instamart@demo", amount: 380 },
  { name: "Uber India", upiId: "uber@demo", amount: 215 },
  { name: "Apollo Pharmacy", upiId: "apollo@demo", amount: 520 },
  { name: "Open amount (you type it)", upiId: "shopkeeper@demo", amount: 0 },
];

export default function MerchantQrPage() {
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState(String(MERCHANTS[0].amount));
  const [svg, setSvg] = useState("");
  const m = MERCHANTS[i];
  const uri = buildUpiUri({ upiId: m.upiId, name: m.name, amount: Number(amount) || undefined });

  useEffect(() => {
    let live = true;
    QRCode.toString(uri, { type: "svg", margin: 1, width: 280 }).then((s) => live && setSvg(s));
    return () => { live = false; };
  }, [uri]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 bg-white p-6 text-[#202124]">
      <div className="text-center">
        <h1 className="text-2xl font-medium">Merchant QR codes</h1>
        <p className="mt-1 text-sm text-[#5f6368]">Open <b>/pay</b> on your phone, tap Scan, and point it at this screen.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {MERCHANTS.map((x, k) => (
          <button key={x.upiId} onClick={() => { setI(k); setAmount(String(x.amount || "")); }} className={cn("rounded-full border px-4 py-2 text-xs font-medium", k === i ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]" : "border-[#dadce0] text-[#5f6368]")}>
            {x.name.replace(" (you type it)", "")}
          </button>
        ))}
      </div>
      <div className="rounded-3xl border border-[#dadce0] p-5 shadow-sm">
        <div role="img" aria-label={`QR code for ${m.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium">{m.name}</p>
        <p className="text-sm text-[#5f6368]">{m.upiId}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-[#5f6368]">
        Amount (₹, blank = payer enters)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="w-28 rounded-lg border border-[#dadce0] px-3 py-2 text-[#202124] outline-none focus:border-[#1a73e8]" />
      </label>
    </div>
  );
}
