"use client";

import { useCallback, useState } from "react";
import { ShieldCheckIcon } from "@animateicons/react/lucide";
import { LoopIcon } from "@/components/ui/LoopIcon";
import QRCode from "qrcode";
import type { TotpSecret } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { startTotpEnroll, finishTotpEnroll, listTotpFactors, unenrollFactor } from "@/lib/firebase/auth";
import { useAsync } from "@/lib/hooks";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

interface Factor {
  uid: string;
  displayName?: string | null;
}

type EnrollStep = "idle" | "enrolling" | "verifying";

async function loadSecurityState(): Promise<{ signedIn: boolean; factors: Factor[] }> {
  await auth.authStateReady();
  if (!auth.currentUser) return { signedIn: false, factors: [] };
  return { signedIn: true, factors: listTotpFactors() };
}

// Enrolling/removing a factor needs a fresh sign-in; Firebase throws this code otherwise.
function mfaErrorMessage(err: unknown, fallback: string): string {
  if ((err as { code?: string })?.code === "auth/requires-recent-login") {
    return "For security, please sign out and sign in again, then retry.";
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * Real two-factor auth via Firebase's native TOTP support -- independent of
 * whichever OAuth provider a user signed in with. This is opt-in per user
 * (enrolling here never affects anyone who doesn't visit this page), and it
 * only applies to a real signed-in session -- the "try demo" path has no
 * Firebase session at all, so there is nothing to protect there.
 */
export default function SecurityPage() {
  const { data, loading, reload } = useAsync(loadSecurityState, []);
  const session = loading ? "loading" : data?.signedIn ? "signed-in" : "signed-out";
  const factors = data?.factors ?? [];

  const [step, setStep] = useState<EnrollStep>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshFactors = useCallback(() => reload(), [reload]);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      const totpSecret = await startTotpEnroll();
      setSecret(totpSecret);
      setQrCode(await QRCode.toDataURL(totpSecret.generateQrCodeUrl(auth.currentUser?.email ?? "user", "FinPilot")));
      setStep("enrolling");
    } catch (err) {
      setError(mfaErrorMessage(err, "Could not start enrollment"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!secret || code.trim().length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await finishTotpEnroll(secret, code.trim());
      setStep("idle");
      setQrCode(null);
      setSecret(null);
      setCode("");
      await refreshFactors();
    } catch (err) {
      setError(mfaErrorMessage(err, "Invalid code -- check your authenticator app and try again"));
    } finally {
      setBusy(false);
    }
  }

  async function unenroll(id: string) {
    setError(null);
    setBusy(true);
    try {
      await unenrollFactor(id);
      await refreshFactors();
    } catch (err) {
      setError(mfaErrorMessage(err, "Could not remove this method"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="flex items-center gap-3 font-display text-3xl text-ink">
          <span className="flex size-11 items-center justify-center rounded-full bg-lime">
            <LoopIcon icon={ShieldCheckIcon} size={24} every={2200} />
          </span>
          Security
        </h1>
        <p className="mt-1 text-sm text-graphite">
          Add a second factor so your financial data is protected even if your password or Google session is
          ever compromised.
        </p>
      </div>

      {session === "loading" && <p className="text-sm text-pewter">Checking your session...</p>}

      {session === "signed-out" && (
        <Card>
          <p className="text-sm text-graphite">
            Two-factor authentication applies to a real signed-in account. Sign in with Google from the nav bar
            first, then come back here to set it up.
          </p>
          <p className="mt-3 text-xs text-pewter">
            Note: if your Google account already has 2-Step Verification turned on, signing in with Google
            already requires it before FinPilot ever sees a token -- this page adds an independent second
            factor on top of that, so your account stays protected even if your Google session is not.
          </p>
        </Card>
      )}

      {session === "signed-in" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Authenticator app (TOTP)</CardTitle>
              {factors.length > 0 ? <Chip tone="accent">Enabled</Chip> : <Chip tone="outline">Not enabled</Chip>}
            </CardHeader>

            {factors.length > 0 && step === "idle" && (
              <div className="flex flex-col gap-3">
                {factors.map((f) => (
                  <div key={f.uid} className="flex items-center justify-between rounded-chip border border-mist px-4 py-3">
                    <div className="text-sm text-ink">
                      {f.displayName || "Authenticator app"}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => unenroll(f.uid)} disabled={busy}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {factors.length === 0 && step === "idle" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-graphite">
                  Use an authenticator app (Google Authenticator, Authy, 1Password, etc.) to require a 6-digit
                  code every time you sign in.
                </p>
                <Button variant="primary" onClick={startEnroll} disabled={busy} className="self-start">
                  Set up authenticator app
                </Button>
              </div>
            )}

            {step === "enrolling" && qrCode && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-graphite">
                  Scan this code with your authenticator app, then enter the 6-digit code it shows.
                </p>
                {/* QR is rendered to a data: URI by the qrcode package. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="Scan with your authenticator app" className="h-48 w-48 self-start rounded-surface border border-mist" />
                {secret && (
                  <p className="text-xs text-pewter">
                    Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret.secretKey}</span>
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="totp-code" className="text-xs text-pewter">
                      6-digit code
                    </label>
                    <input
                      id="totp-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      className="w-32 rounded-chip border border-mist px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                  </div>
                  <Button variant="primary" onClick={confirmEnroll} disabled={busy || code.length !== 6}>
                    Verify &amp; enable
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStep("idle");
                      setQrCode(null);
                      setCode("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-ink">{error}</p>}
          </Card>

          <Card>
            <CardTitle>Data &amp; privacy</CardTitle>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-graphite">
              <li>
                Your account data is protected by Firestore security rules -- clients can only read their own
                documents, and all writes go through the authenticated API.
              </li>
              <li>
                When you ask the copilot a question, a summary of your relevant financial data is sent to
                NVIDIA&apos;s hosted AI models to generate the answer. If you&apos;d rather nothing leave this app,
                the copilot always has a fully offline fallback that never calls an external AI service.
              </li>
              <li>API access to your data requires a valid, matching sign-in token -- it is never inferred from a URL alone.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
