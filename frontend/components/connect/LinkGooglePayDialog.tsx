"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import type { ConfirmationResult } from "firebase/auth";
import { api } from "@/lib/api";
import { authErrorMessage, confirmPhoneOtp, sendPhoneOtp } from "@/lib/firebase/auth";
import type { ConnectProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Progress } from "@/components/shadcn/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { GooglePayMark } from "@/components/connect/GooglePayMark";

const PROFILES: { id: ConnectProfile; name: string; blurb: string; color: string }[] = [
  { id: "priya", name: "Priya", blurb: "Bengaluru · salaried · ₹1L/mo", color: "bg-leaf" },
  { id: "arjun", name: "Arjun", blurb: "Mumbai · senior pro · ₹1.8L/mo", color: "bg-sky" },
  { id: "meera", name: "Meera", blurb: "Pune · freelance · ₹52k/mo", color: "bg-ember" },
];

const STEPS = ["Consent approved", "Fetching encrypted bank data", "Decrypting and reading UPI payments", "Building your dashboard"];

type Phase = "details" | "verify" | "otp" | "working";

// set while the user is away approving the consent on the Account Aggregator's own screens
const PENDING_KEY = "finpilot-aa-pending";

/** Links the user's UPI/Google Pay payments through their bank accounts using the RBI Account Aggregator flow. */
export function LinkGooglePayDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ConnectProfile>("priya");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [handle, setHandle] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [phase, setPhase] = useState<Phase>("details");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  const mobileOk = /^[6-9]\d{9}$/.test(mobile);

  function reset() {
    setPhase("details");
    setOtp("");
    setSmsCode("");
    setConfirmation(null);
    setStep(0);
  }

  /** Everyone proves they own the number with a real SMS OTP (Firebase) before consent. */
  async function requestConsent() {
    setBusy(true);
    try {
      setConfirmation(await sendPhoneOtp(mobile, recaptchaRef.current!));
      setSmsCode("");
      setPhase("verify");
      toast.success(`OTP sent to +91 ${mobile.slice(0, 2)}******${mobile.slice(-2)}`);
    } catch (e) {
      // Phone sign-in not enabled (or no billing) in Firebase: carry on, the aggregator still checks the number with its own OTP
      if (["auth/operation-not-allowed", "auth/billing-not-enabled"].includes((e as { code?: string }).code ?? "")) {
        await askConsent();
        return;
      }
      toast.error(authErrorMessage(e, "Could not send the OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function verifySms() {
    if (!confirmation) return;
    setBusy(true);
    try {
      await confirmPhoneOtp(confirmation, smsCode);
    } catch (e) {
      toast.error(authErrorMessage(e, "Could not verify the OTP"));
      setBusy(false);
      return;
    }
    await askConsent(true);
  }

  async function askConsent(phoneVerified = false) {
    setBusy(true);
    try {
      const r = await api.aaConsent(userId, mobile, profile, `${window.location.origin}/connect`);
      if (r.redirect_url) {
        // real Account Aggregator: it takes the OTP and bank linking on its own screens, then sends the user back here
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ userId, handle: r.handle }));
        window.location.assign(r.redirect_url);
        return;
      }
      if (phoneVerified && r.demo_otp) {
        // the real SMS OTP already proved the number, so the demo aggregator's own OTP step is redundant
        await importConsent((await api.aaApprove(userId, r.handle, r.demo_otp)).consent_id);
        return;
      }
      setHandle(r.handle);
      setDemoOtp(r.demo_otp ?? "");
      setPhase("otp");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the consent request");
    } finally {
      setBusy(false);
    }
  }

  async function approveAndImport() {
    setBusy(true);
    try {
      const { consent_id } = await api.aaApprove(userId, handle, otp);
      await importConsent(consent_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link your accounts");
      setBusy(false);
    }
  }

  async function importConsent(consent_id: string) {
    setBusy(true);
    let ticker: ReturnType<typeof setInterval> | undefined;
    try {
      setPhase("working");
      setStep(0);
      ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650);
      const [res] = await Promise.all([api.aaImport(userId, consent_id), new Promise((r) => setTimeout(r, 2200))]);
      setStep(STEPS.length);
      toast.success(`Linked ${res.accounts} bank accounts: ${res.transactions} transactions imported`);
      setTimeout(() => {
        onOpenChange(false);
        reset();
        router.push("/dashboard");
      }, 900);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link your accounts");
      // a wrong OTP keeps the user on the OTP step; anything after approval goes back to the start
      setPhase((p) => (p === "working" ? "details" : p));
    } finally {
      if (ticker) clearInterval(ticker);
      setBusy(false);
    }
  }

  // back from the Account Aggregator's consent screens: finish the import
  useEffect(() => {
    try {
      const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as { userId: string; handle: string } | null;
      if (p?.userId === userId) {
        sessionStorage.removeItem(PENDING_KEY);
        onOpenChange(true);
        void importConsent(p.handle);
      }
    } catch {
      // storage unavailable: the user just starts again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => phase !== "working" && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GooglePayMark className="text-2xl" />
            <Badge variant="outline" className="border-ember/40 bg-tint-ember text-ember-dark">Demo AA</Badge>
          </div>
          <DialogTitle className="font-display text-xl">Link via Account Aggregator</DialogTitle>
          <DialogDescription>
            Your UPI payments come from your bank accounts, shared with your consent through the RBI Account Aggregator framework. Demo mode uses a sample bank.
          </DialogDescription>
        </DialogHeader>

        {phase === "details" && (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Mobile number linked to your bank
              <Input inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} />
            </label>
            <div role="radiogroup" aria-label="Sample bank customer" className="grid gap-2">
              {PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={profile === p.id}
                  onClick={() => setProfile(p.id)}
                  className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition-all", profile === p.id ? "border-ink bg-tint-lime shadow-sm" : "border-border hover:bg-fog")}
                >
                  <span className={cn("flex size-10 items-center justify-center rounded-full font-display text-lg font-semibold text-white", p.color)}>{p.name[0]}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block text-xs text-graphite">{p.blurb}</span>
                  </span>
                  {profile === p.id && <CheckCircle2 className="size-5 text-ink" />}
                </button>
              ))}
            </div>
            <ul className="grid gap-1.5 rounded-2xl bg-fog p-3 text-xs text-graphite">
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-leaf" /> Read-only: bank balances and the last 12 months of transactions</li>
              <li className="flex items-center gap-2"><Lock className="size-4 text-leaf" /> Data is encrypted end to end. Disconnect any time.</li>
            </ul>
            <Button size="lg" onClick={requestConsent} disabled={!mobileOk || busy} className="rounded-full bg-lime text-ink hover:bg-lime-dark">
              {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />} Request consent
            </Button>
          </div>
        )}

        {/* invisible reCAPTCHA anchor for Firebase phone auth; must stay mounted */}
        <div ref={recaptchaRef} />

        {phase === "verify" && (
          <div className="grid gap-4">
            <p className="rounded-2xl bg-tint-lime p-3 text-sm text-ink">
              We texted a 6-digit OTP to +91 {mobile.slice(0, 2)}******{mobile.slice(-2)}. Enter it to confirm this number is yours.
            </p>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit OTP" aria-label="SMS OTP" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} disabled={busy}>Back</Button>
              <Button variant="outline" onClick={requestConsent} disabled={busy}>Resend</Button>
              <Button className="flex-1 rounded-full bg-lime text-ink hover:bg-lime-dark" onClick={verifySms} disabled={smsCode.length !== 6 || busy}>
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />} Verify &amp; continue
              </Button>
            </div>
          </div>
        )}

        {phase === "otp" && (
          <div className="grid gap-4">
            <p className="rounded-2xl bg-tint-lime p-3 text-sm text-ink">
              The Account Aggregator sent an OTP to {mobile.slice(0, 2)}******{mobile.slice(-2)}. Approve to share your account data with FinPilot.
              <span className="mt-1 block text-xs text-graphite">Demo OTP: {demoOtp}</span>
            </p>
            <Input inputMode="numeric" maxLength={6} placeholder="6-digit OTP" aria-label="OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} disabled={busy}>Back</Button>
              <Button className="flex-1 rounded-full bg-lime text-ink hover:bg-lime-dark" onClick={approveAndImport} disabled={otp.length !== 6 || busy}>
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />} Approve &amp; link
              </Button>
            </div>
          </div>
        )}

        {phase === "working" && (
          <div className="grid gap-4 py-2">
            <Progress value={Math.min(100, ((step + 0.5) / STEPS.length) * 100)} className="h-2" />
            <ul className="grid gap-2.5">
              {STEPS.map((label, i) => (
                <li key={label} className={cn("flex items-center gap-2.5 text-sm", i > step ? "text-pewter" : "text-ink")}>
                  {i < step || step >= STEPS.length ? <CheckCircle2 className="size-5 text-leaf" /> : i === step ? <Loader2 className="size-5 animate-spin text-sky" /> : <span className="size-5 rounded-full border border-mist" />}
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
