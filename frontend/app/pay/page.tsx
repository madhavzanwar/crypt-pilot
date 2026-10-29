"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, AtSign, Check, ChevronDown, Delete, ImageUp, Landmark, Phone, QrCode, Receipt, ScanLine, Search, Smartphone, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import type { PayResult } from "@/lib/types";
import { parseUpi, type UpiTarget } from "@/lib/upi";
import { cn } from "@/lib/utils";
import { PaymentHelp, upiRef } from "@/components/pay/PaymentHelp";

// A look-alike of the familiar scan-and-pay flow, built for a demo: no real money moves and nothing talks to a bank.
const BLUE = "#1a73e8";
const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Screen = "home" | "scan" | "pay" | "upi" | "pin" | "busy" | "done" | "fail";

declare global {
  interface Window { BarcodeDetector?: new (o?: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }
}

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-medium text-white" style={{ width: size, height: size, background: `hsl(${hue} 55% 45%)`, fontSize: size * 0.42 }}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function Scanner({ onFound, onBack }: { onFound: (t: UpiTarget) => void; onBack: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState("Point your camera at a UPI QR code");
  const [manual, setManual] = useState("");
  const done = useRef(false);

  const accept = useCallback((text: string) => {
    const t = parseUpi(text);
    if (!t) { setMsg("That is not a UPI QR code. Try another."); return false; }
    if (!done.current) { done.current = true; onFound(t); }
    return true;
  }, [onFound]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false; // set on unmount, which can happen while the camera permission prompt is open
    (async () => {
      if (!window.BarcodeDetector) { setMsg("This browser cannot scan live. Use a photo of the QR, or type the UPI ID."); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; await video.current.play(); }
        if (cancelled) return;
        const det = new window.BarcodeDetector!({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current || done.current || video.current.readyState < 2) return;
          const hits = await det.detect(video.current).catch(() => []);
          if (hits[0]) accept(hits[0].rawValue);
        }, 250);
      } catch {
        setMsg("Camera blocked or unavailable. Use a photo of the QR, or type the UPI ID.");
      }
    })();
    return () => { cancelled = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [accept]);

  async function fromPhoto(f: File | undefined) {
    if (!f || !window.BarcodeDetector) return setMsg("Photo scanning is not supported in this browser. Type the UPI ID instead.");
    const hits = await new window.BarcodeDetector({ formats: ["qr_code"] }).detect(await createImageBitmap(f)).catch(() => []);
    if (!hits[0]) setMsg("No QR code found in that photo.");
    else accept(hits[0].rawValue);
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 p-4">
        <button aria-label="Back" onClick={onBack} className="rounded-full p-2 active:bg-white/15"><ArrowLeft className="size-6" /></button>
        <span className="text-lg">Scan any QR code</span>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative size-64">
          {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"].map((c) => (
            <span key={c} className={cn("absolute size-10 border-white", c)} />
          ))}
          <ScanLine className="absolute inset-0 m-auto size-10 animate-pulse text-white/60" />
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-black/80 p-4 pb-8">
        <p role="status" className="text-center text-sm text-white/80">{msg}</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-white/40 py-3 text-sm font-medium active:bg-white/15">
          <ImageUp className="size-5" /> Upload from gallery
          <input type="file" accept="image/*" className="hidden" onChange={(e) => fromPhoto(e.target.files?.[0])} />
        </label>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); accept(manual); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="or type a UPI ID, e.g. chai@demo" autoCapitalize="none" autoCorrect="off" className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-3 text-sm outline-none placeholder:text-white/50" />
          <button className="rounded-full bg-white px-5 text-sm font-medium text-black">Go</button>
        </form>
      </div>
    </div>
  );
}

function PinPad({ bank, amount, payee, onSubmit, onBack }: { bank: string; amount: number; payee: string; onSubmit: () => void; onBack: () => void }) {
  const [pin, setPin] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const press = (k: string) => setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 6 ? p + k : p));
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="flex items-center gap-3 p-4">
        <button aria-label="Cancel" onClick={onBack} className="rounded-full p-2 active:bg-black/10"><X className="size-6" /></button>
        <span className="text-sm text-[#5f6368]">{bank}</span>
      </div>
      <div className="px-6 pt-4 text-center">
        <p className="text-sm text-[#5f6368]">Paying {payee}</p>
        <p className="mt-1 text-4xl font-normal text-[#202124]">{inr(amount)}</p>
        <p className="mt-8 text-base font-medium text-[#202124]">Enter UPI PIN</p>
        <div className="mt-4 flex justify-center gap-3" aria-label={`${pin.length} digits entered`}>
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("size-3.5 rounded-full border-2", i < pin.length ? "border-[#202124] bg-[#202124]" : "border-[#dadce0]")} />)}
        </div>
        <p className="mt-3 text-xs text-[#5f6368]">Demo: any 4 to 6 digits works</p>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-px bg-[#f1f3f4] pb-[env(safe-area-inset-bottom)]">
        {keys.map((k, i) => (
          <button key={i} disabled={!k} onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k || undefined} className="flex h-16 items-center justify-center bg-white text-2xl text-[#202124] active:bg-[#f1f3f4]">
            {k === "⌫" ? <Delete className="size-6" /> : k}
          </button>
        ))}
        <button disabled={pin.length < 4} onClick={onSubmit} className="col-span-3 flex h-14 items-center justify-center gap-2 text-base font-medium text-white disabled:opacity-40" style={{ background: BLUE }}>
          <Check className="size-5" /> Pay {inr(amount)}
        </button>
      </div>
    </div>
  );
}

const PEOPLE = [
  { name: "Aarav", upiId: "aarav@demo" }, { name: "Meera", upiId: "meera@demo" }, { name: "Rahul", upiId: "rahul@demo" },
  { name: "Sneha", upiId: "sneha@demo" }, { name: "Karan", upiId: "karan@demo" },
];
const BUSINESSES = [
  { name: "Sharma Tea Stall", upiId: "sharmatea@demo" }, { name: "Fresh Basket", upiId: "freshbasket@demo" },
  { name: "Swiggy Instamart", upiId: "instamart@demo" }, { name: "Apollo Pharmacy", upiId: "apollo@demo" },
];
const BANK = "Priya Checking - HDFC";

function Snack({ text }: { text: string }) {
  return <div role="status" className="fixed inset-x-4 bottom-6 z-20 mx-auto max-w-sm rounded-lg bg-[#202124] px-4 py-3 text-sm text-white">{text}</div>;
}

const PAIR_KEY = "finpilot:pay_pair";

/** Which account the phone pays into: the pairing link (?u=&pair=) from the website's dashboard, remembered across launches; else the demo persona. */
function usePairing(u: string | null, pair: string | null): { userId: string; code?: string } {
  const [saved, setSaved] = useState<{ u: string; code: string } | null>(null);
  useEffect(() => {
    try {
      if (u && pair) window.localStorage.setItem(PAIR_KEY, JSON.stringify({ u, code: pair }));
      const raw = window.localStorage.getItem(PAIR_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setSaved(raw ? JSON.parse(raw) : null);
    } catch {
      setSaved(u && pair ? { u, code: pair } : null);
    }
  }, [u, pair]);
  if (u && pair) return { userId: u, code: pair };
  if (saved) return { userId: saved.u, code: saved.code };
  return { userId: u || "demo-priya" };
}

function PayApp() {
  const params = useSearchParams();
  const { userId, code } = usePairing(params.get("u"), params.get("pair"));
  const [history, setHistory] = useState<{ id: string; merchant: string; amount: number; date: string }[]>([]);
  const loadHistory = useCallback(() => {
    api.payHistory(userId, code).then(setHistory).catch(() => setHistory([]));
  }, [userId, code]);
  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 4000); // picks up payments made on another device or edits from the website
    return () => clearInterval(id);
  }, [loadHistory]);
  const [screen, setScreen] = useState<Screen>("home");
  const [target, setTarget] = useState<UpiTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState("");
  const [snack, setSnack] = useState("");
  const [upiText, setUpiText] = useState("");
  const [help, setHelp] = useState(false);

  const found = useCallback((t: UpiTarget) => { setTarget(t); setAmount(t.amount ? String(t.amount) : ""); setNote(t.note ?? ""); setScreen("pay"); }, []);
  const toast = (m: string) => { setSnack(m); setTimeout(() => setSnack(""), 2200); };
  const soon = () => toast("Not available in this demo");
  const amt = Number(amount);
  const valid = amt > 0 && amt <= 100_000;

  async function pay() {
    if (!target) return;
    if (!navigator.onLine) { setError("No internet connection. The payment was not made and no money was sent."); setScreen("fail"); return; }
    setHelp(false);
    setScreen("busy");
    try {
      const [r] = await Promise.all([api.pay(userId, { payee_name: target.name, upi_id: target.upiId, amount: amt, note: note || undefined }, code), new Promise((ok) => setTimeout(ok, 1200))]);
      setResult(r);
      setScreen("done");
      loadHistory();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      // a thrown network error or a 5xx means the bank/server could not be reached; a 4xx message is the reason the payment was refused
      setError(!m || m.startsWith("API ") || /fetch|network/i.test(m) ? "Could not reach the bank. The payment was not made and no money was sent." : m);
      setScreen("fail");
    }
  }

  if (screen === "scan") return <Scanner onFound={found} onBack={() => setScreen("home")} />;
  if (screen === "pin" && target) return <PinPad bank={BANK} amount={amt} payee={target.name} onSubmit={pay} onBack={() => setScreen("pay")} />;

  if (screen === "busy") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white">
        <div className="size-14 animate-spin rounded-full border-4 border-[#e8eaed] border-t-[#1a73e8]" />
        <p className="text-[#5f6368]">Paying {inr(amt)}…</p>
      </div>
    );
  }

  if (screen === "done" && result) {
    return (
      <div className="flex min-h-dvh flex-col bg-white px-6 pt-20 text-[#202124]">
        <div className="flex size-16 items-center justify-center rounded-full" style={{ background: BLUE }}><Check className="size-9 text-white" strokeWidth={3} /></div>
        <p className="mt-6 text-lg text-[#5f6368]">Paid to {result.payee_name}</p>
        <p className="text-sm text-[#5f6368]">{result.upi_id}</p>
        <p className="mt-2 text-5xl">{inr(result.amount)}</p>
        <p className="mt-2 text-xs text-[#5f6368]">{new Date(result.paid_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        <div className="mt-6 rounded-2xl border border-[#dadce0] p-4 text-sm">
          <p className="text-[#5f6368]">From</p>
          <p className="font-medium">{result.account}</p>
          <p className="mt-3 text-[#5f6368]">UPI transaction ID</p>
          <p className="font-medium">{upiRef(result.id)}</p>
        </div>
        <button onClick={() => setHelp((h) => !h)} className="mt-3 text-left text-sm" style={{ color: BLUE }}>{help ? "Hide refund help" : "Need a refund or want to cancel?"}</button>
        {help && <div className="mt-2"><PaymentHelp light payee={result.payee_name} amount={inr(result.amount)} ref={upiRef(result.id)} account={result.account} /></div>}
        <p className="mt-3 text-xs text-[#5f6368]">Added to your FinPilot dashboard automatically.</p>
        <div className="mt-auto flex gap-3 pb-8 pt-6">
          <button onClick={() => toast("Screenshot sharing is not available in this demo")} className="flex-1 rounded-full border border-[#dadce0] py-3.5 text-sm font-medium" style={{ color: BLUE }}>Share screenshot</button>
          <button onClick={() => { setScreen("home"); setTarget(null); }} className="flex-1 rounded-full py-3.5 text-sm font-medium text-white" style={{ background: BLUE }}>Done</button>
        </div>
        {snack && <Snack text={snack} />}
      </div>
    );
  }

  if (screen === "fail") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-[#d93025]"><X className="size-12 text-white" strokeWidth={3} /></div>
        <p className="text-xl text-[#202124]">{/^(Insufficient|Over your)/.test(error) ? "Payment blocked" : "Payment failed"}</p>
        <p className="text-sm text-[#5f6368]">{error}</p>
        <button onClick={() => setScreen("pay")} className="mt-4 w-full rounded-full py-3.5 text-base font-medium text-white" style={{ background: BLUE }}>Try again</button>
        <button onClick={() => setScreen("home")} className="text-sm" style={{ color: BLUE }}>Cancel</button>
      </div>
    );
  }

  if (screen === "pay" && target) {
    return (
      <div className="flex min-h-dvh flex-col bg-white text-[#202124]">
        <div className="flex items-center gap-2 p-4">
          <button aria-label="Back" onClick={() => setScreen("home")} className="rounded-full p-2 active:bg-black/10"><ArrowLeft className="size-6" /></button>
          <Avatar name={target.name} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Paying {target.name}</p>
            <p className="truncate text-xs text-[#5f6368]">{target.upiId}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl">₹</span>
            <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} placeholder="0" aria-label="Amount" className="w-48 bg-transparent text-center text-6xl outline-none placeholder:text-[#dadce0]" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Add a note" className="mt-6 rounded-full bg-[#f1f3f4] px-6 py-2.5 text-center text-sm outline-none" />
          {amt > 100_000 && <p className="mt-3 text-xs text-[#c5221f]">UPI limit is ₹1,00,000 per payment</p>}
        </div>
        <div className="rounded-t-3xl border-t border-[#e8eaed] bg-white p-5 pb-8 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <p className="text-xs text-[#5f6368]">Choose account to pay with</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#e8f0fe]"><Landmark className="size-5" style={{ color: BLUE }} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{BANK}</p><p className="text-xs text-[#5f6368]">Savings account</p></div>
            <Check className="size-5" style={{ color: BLUE }} />
          </div>
          <button disabled={!valid} onClick={() => setScreen("pin")} className="mt-5 w-full rounded-full py-3.5 text-base font-medium text-white disabled:opacity-40" style={{ background: BLUE }}>
            {valid ? `Pay ${inr(amt)}` : "Enter an amount"}
          </button>
        </div>
      </div>
    );
  }

  if (screen === "upi") {
    const go = () => { const t = parseUpi(upiText.trim()); if (t) found(t); else toast("Enter a valid UPI ID, like name@bank"); };
    return (
      <div className="min-h-dvh bg-white p-4 text-[#202124]">
        <button aria-label="Back" onClick={() => setScreen("home")} className="rounded-full p-2 active:bg-black/10"><ArrowLeft className="size-6" /></button>
        <h1 className="mt-4 px-2 text-2xl">Pay to UPI ID</h1>
        <form className="mt-6 px-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input autoFocus value={upiText} onChange={(e) => setUpiText(e.target.value)} placeholder="name@bank" autoCapitalize="none" autoCorrect="off" className="w-full rounded-xl border border-[#dadce0] px-4 py-3.5 outline-none focus:border-[#1a73e8]" />
          <button className="mt-6 w-full rounded-full py-3.5 text-base font-medium text-white" style={{ background: BLUE }}>Continue</button>
        </form>
        {snack && <Snack text={snack} />}
      </div>
    );
  }

  const tiles: [string, typeof QrCode, () => void][] = [
    ["Scan any QR code", ScanLine, () => setScreen("scan")], ["Pay contacts", Users, () => setScreen("upi")],
    ["Pay phone number", Phone, soon], ["Bank transfer", Landmark, soon],
    ["Pay to UPI ID", AtSign, () => setScreen("upi")], ["Self transfer", ArrowLeftRight, soon],
    ["Pay bills", Receipt, soon], ["Mobile recharge", Smartphone, soon],
  ];
  return (
    <div className="min-h-dvh bg-white text-[#202124]">
      <div className="bg-gradient-to-b from-[#c6dafc] via-[#e8f0fe] to-white pb-6">
        <header className="flex items-center gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-white px-5 py-4 text-base text-[#5f6368] shadow-md">
            <Search className="size-5" /> Pay by name or phone number
          </div>
          <Avatar name="Priya" size={48} />
        </header>
        <div className="px-6 pb-2 pt-6">
          <p className="text-3xl font-normal leading-tight">Pay anyone,<br />instantly</p>
          <p className="mt-2 text-xs text-[#5f6368]">FinPilot Pay · demo, no real money moves</p>
        </div>
        <div className="h-16" />
      </div>

      <section className="-mt-16 mx-4 grid grid-cols-4 gap-y-6 rounded-3xl bg-white px-1 py-6 shadow-[0_2px_12px_rgba(60,64,67,0.15)]">
        {tiles.map(([label, Icon, fn]) => (
          <button key={label} onClick={fn} className="flex flex-col items-center gap-2 px-1 active:opacity-60">
            <span className="flex size-16 items-center justify-center rounded-full bg-[#e8f0fe]"><Icon className="size-7" style={{ color: BLUE }} /></span>
            <span className="text-center text-xs leading-tight">{label}</span>
          </button>
        ))}
      </section>

      <section className="mt-8 px-5">
        <h2 className="text-base font-medium">People</h2>
        <div className="mt-3 grid grid-cols-4 gap-y-4">
          {PEOPLE.map((p) => (
            <button key={p.upiId} onClick={() => found({ name: p.name, upiId: p.upiId })} className="flex flex-col items-center gap-1.5 active:opacity-60">
              <Avatar name={p.name} size={64} /><span className="text-sm">{p.name}</span>
            </button>
          ))}
          <button onClick={() => setScreen("upi")} className="flex flex-col items-center gap-1.5 active:opacity-60">
            <span className="flex size-16 items-center justify-center rounded-full bg-[#f1f3f4]"><ChevronDown className="size-6 text-[#5f6368]" /></span><span className="text-xs">More</span>
          </button>
        </div>
      </section>

      <section className="mt-7 px-5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Business &amp; bills</h2>
          <button onClick={soon} className="rounded-full border border-[#dadce0] px-4 py-1.5 text-xs font-medium" style={{ color: BLUE }}>Explore</button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-y-4">
          {BUSINESSES.map((b) => (
            <button key={b.upiId} onClick={() => found({ name: b.name, upiId: b.upiId })} className="flex flex-col items-center gap-1.5 active:opacity-60">
              <Avatar name={b.name} size={64} /><span className="line-clamp-2 text-center text-xs leading-tight">{b.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="px-5 pb-32">
        <h2 className="text-base font-medium">Recent payments</h2>
        <ul className="mt-2 divide-y divide-[#f1f3f4]">
          {history.length === 0 && <li className="py-4 text-sm text-[#5f6368]">No payments yet.</li>}
          {history.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <Avatar name={t.merchant} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.merchant}</p>
                <p className="text-xs text-[#5f6368]">{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              <span className="text-sm tabular-nums">{inr(t.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md justify-center bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8">
        <button onClick={() => setScreen("scan")} className="flex items-center gap-3 rounded-full px-8 py-4 text-base font-medium text-white shadow-lg active:scale-95" style={{ background: BLUE }}>
          <ScanLine className="size-6" /> Scan any QR code
        </button>
      </div>
      {snack && <Snack text={snack} />}
    </div>
  );
}

export default function PayPage() {
  return (
    <div className="min-h-dvh w-full bg-white" style={{ fontFamily: "'Google Sans', Roboto, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-md"><Suspense fallback={null}><PayApp /></Suspense></div>
    </div>
  );
}
