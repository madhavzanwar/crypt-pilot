"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ScanText, ShieldCheck, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OcrPreview } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const LABELS: Record<string, string> = {
  identity_lines: "name / address lines",
  account_number: "account numbers",
  phone: "phone numbers",
  email: "email addresses",
  pan: "PAN numbers",
  aadhaar: "Aadhaar numbers",
  ifsc: "IFSC codes",
  upi_id: "UPI IDs",
};

export default function UploadPage() {
  const userId = useUserId();
  const input = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<OcrPreview | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<number | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    setSkip(new Set());
    try {
      setPreview(await api.extractStatement(userId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (camInput.current) camInput.current.value = "";
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }
  useEffect(() => stopCamera, []);
  useEffect(() => {
    if (live && videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [live]);

  // Desktop browsers ignore <input capture>, so open a live preview; phones and browsers without a camera API use the native picker.
  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) return camInput.current?.click();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setLive(true);
    } catch {
      setError("Camera access was blocked or no camera was found. You can upload a photo instead.");
    }
  }

  function takePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => {
      stopCamera();
      if (b) void pick(new File([b], `document-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const rows = preview.transactions.filter((_, i) => !skip.has(i));
      setDone((await api.importOcr(userId, rows)).imported);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const removed = preview ? Object.entries(preview.removed) : [];
  const chosen = preview ? preview.transactions.length - skip.size : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Upload document</h1>
        <p className="mt-1 text-sm text-graphite">A bank statement or a photo of your passbook, in English, Hindi or Marathi (Hindi numerals too). We read it on this server, remove personal details, and save only the transactions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <ScanText className="mr-2 inline size-4" /> Choose a file
          </CardTitle>
        </CardHeader>
        <div className="flex flex-col items-start gap-3 p-5 pt-0">
          <input ref={input} type="file" accept="image/*,.txt,.csv" aria-label="Choose a document to upload" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={camInput} type="file" accept="image/*" capture="environment" aria-label="Take a photo of a document" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {live ? (
            <div className="flex w-full flex-col gap-2">
              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" />
              <p className="text-xs text-pewter">Hold the document flat, fill the frame, and keep the text sharp.</p>
              <div className="flex gap-2">
                <Button variant="lime" onClick={takePhoto} className="flex-1"><Camera className="size-4" /> Capture</Button>
                <Button variant="secondary" onClick={stopCamera}><X className="size-4" /> Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="lime" onClick={openCamera} disabled={busy}>
                <Camera className="size-4" /> {busy ? "Working…" : "Scan with camera"}
              </Button>
              <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
                <Upload className="size-4" /> Upload photo or statement
              </Button>
            </div>
          )}
          <p className="text-xs text-pewter">JPG, PNG, WebP, or a .txt / .csv statement, up to 5 MB. The file itself is never stored.</p>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          {done !== null && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Saved {done} transactions. They now appear in Transactions and your dashboard.
            </p>
          )}
        </div>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Review before saving</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4 p-5 pt-0">
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {removed.length
                ? `Removed before saving: ${removed.map(([k, n]) => `${n} ${LABELS[k] ?? k}`).join(", ")}.`
                : "No personal details were found in this file."}
            </p>
            <ul className="divide-y divide-mist">
              {preview.transactions.map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={!skip.has(i)} aria-label={`Include ${t.description}`}
                    onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{t.description}</p>
                    <p className="text-xs text-pewter">{formatDate(t.date)}</p>
                  </div>
                  <p className={`tnum text-sm font-medium ${t.amount < 0 ? "text-ink" : "text-emerald-700"}`}>{formatCurrency(t.amount)}</p>
                </li>
              ))}
            </ul>
            <Button variant="lime" onClick={save} disabled={busy || chosen === 0}>
              Save {chosen} transactions
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
