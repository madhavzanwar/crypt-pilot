"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { formatCurrency } from "@/lib/format";
import type { SnapResult } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const field = "h-11 rounded-xl border border-mist bg-paper px-3 text-sm text-ink outline-none focus:border-ink";

export default function PhotosPage() {
  const userId = useUserId();
  const items = useAsync(useCallback(() => api.taughtItems(userId), [userId]), [userId]);
  const snapInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SnapResult | null>(null);
  const [lastPhoto, setLastPhoto] = useState<File | null>(null);
  const [confirmPrice, setConfirmPrice] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");

  const [teachFile, setTeachFile] = useState<File | null>(null);
  const [teachName, setTeachName] = useState("");
  const [teachPrice, setTeachPrice] = useState("");
  const [taught, setTaught] = useState<string | null>(null);

  async function run<T>(job: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
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

  // Desktop browsers ignore <input capture>, so open a live preview; phones/no-camera fall back to the native picker.
  async function openCamera() {
    setChoosing(false);
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
      if (b) void snap(new File([b], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  async function snap(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setLastPhoto(file);
    const out = await run(() => api.snapPhoto(userId, file));
    if (snapInput.current) snapInput.current.value = "";
    if (camInput.current) camInput.current.value = "";
    if (!out) return;
    setResult(out);
    if (!out.added) {
      setConfirmName(out.suggestion.item ?? "");
      setConfirmPrice(out.suggestion.price != null ? String(out.suggestion.price) : "");
    }
  }

  async function confirm() {
    const out = await run(() => api.addExpense(userId, confirmName, Number(confirmPrice), lastPhoto ?? undefined));
    if (out) setResult({ added: true, id: out.id, item: out.item, amount: out.amount, category: out.category });
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const out = await run(() => api.addExpense(userId, quickName, Number(quickPrice)));
    if (!out) return;
    setResult({ added: true, id: out.id, item: out.item, amount: out.amount, category: out.category });
    setQuickName("");
    setQuickPrice("");
  }

  async function teach(e: React.FormEvent) {
    e.preventDefault();
    if (!teachFile) return;
    const out = await run(() => api.teachItem(userId, teachName, Number(teachPrice), teachFile));
    if (out) {
      setTaught(`${out.item} = ${formatCurrency(out.price)}`);
      setTeachFile(null);
      setTeachName("");
      setTeachPrice("");
      items.reload();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Photo prices</h1>
        <p className="mt-1 text-sm text-graphite">Teach FinPilot a photo and its price once. After that, a photo of it is all you need to add the expense.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add an expense</CardTitle>
        </CardHeader>
        <form onSubmit={quickAdd} className="flex flex-col gap-3 p-5 pt-0">
          <input className={field} value={quickName} onChange={(e) => setQuickName(e.target.value)} aria-label="Item" placeholder="What did you buy? e.g. tea" required />
          <input className={field} value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} aria-label="Amount (₹)" placeholder="Amount (₹), e.g. 15" inputMode="decimal" required />
          <Button type="submit" variant="primary" disabled={busy || !quickName.trim() || !(Number(quickPrice) > 0)}>Add expense</Button>
          <p className="text-xs text-graphite">No photo needed. It is saved as today&apos;s cash expense and shows in your transactions.</p>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add by photo</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3 p-5 pt-0">
          <input ref={snapInput} type="file" accept="image/*" className="hidden" onChange={(e) => snap(e.target.files?.[0])} />
          <input ref={camInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => snap(e.target.files?.[0])} />
          {live ? (
            <div className="flex flex-col gap-2">
              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" />
              <div className="flex gap-2">
                <Button variant="lime" onClick={takePhoto} className="flex-1"><Camera className="size-4" /> Capture</Button>
                <Button variant="secondary" onClick={stopCamera}><X className="size-4" /> Cancel</Button>
              </div>
            </div>
          ) : choosing ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="lime" onClick={openCamera} disabled={busy}><Camera className="size-4" /> Use camera</Button>
              <Button variant="secondary" onClick={() => { setChoosing(false); snapInput.current?.click(); }} disabled={busy}><ImageUp className="size-4" /> Upload photo</Button>
            </div>
          ) : (
            <Button variant="lime" onClick={() => setChoosing(true)} disabled={busy}>
              <Camera className="size-4" /> {busy ? "Working…" : "Take or choose a photo"}
            </Button>
          )}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          {result?.added && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Added {result.item} for {formatCurrency(result.amount)}.
            </p>
          )}
          {result && !result.added && (
            <div className="flex flex-col gap-2 rounded-xl bg-sage p-3">
              <p className="text-sm text-ink">
                {result.suggestion.item ? `Looks like ${result.suggestion.item}.` : "I do not know this one yet."} Confirm the name and price to add it, and I will remember it.
              </p>
              <input className={field} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder="What is it?" />
              <input className={field} value={confirmPrice} onChange={(e) => setConfirmPrice(e.target.value)} placeholder="Price (₹)" inputMode="decimal" />
              <Button variant="primary" onClick={confirm} disabled={busy || !confirmName.trim() || !(Number(confirmPrice) > 0)}>
                Add expense
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teach a photo</CardTitle>
        </CardHeader>
        <form onSubmit={teach} className="flex flex-col gap-3 p-5 pt-0">
          <input type="file" accept="image/*" capture="environment" required={!teachFile} onChange={(e) => setTeachFile(e.target.files?.[0] ?? null)} className="text-sm text-graphite file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-chip file:border file:border-mist file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-fog" />
          <input className={field} value={teachName} onChange={(e) => setTeachName(e.target.value)} placeholder="Name, e.g. tea" required />
          <input className={field} value={teachPrice} onChange={(e) => setTeachPrice(e.target.value)} placeholder="Price (₹), e.g. 15" inputMode="decimal" required />
          <Button type="submit" variant="primary" disabled={busy || !teachFile}>
            Remember this
          </Button>
          {taught && <p className="text-sm text-emerald-700">Remembered: {taught}. Nothing was added to your spending.</p>}
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What I remember</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-mist px-5 pb-4">
          {(items.data ?? []).length === 0 && <li className="py-3 text-sm text-pewter">Nothing yet.</li>}
          {(items.data ?? []).map((i) => (
            <li key={i.item} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm capitalize text-ink">{i.item}</span>
              <span className="tnum text-sm font-medium">{formatCurrency(i.price)}</span>
              <button type="button" aria-label={`Forget ${i.item}`} className="text-pewter hover:text-rose-600" onClick={async () => { await api.forgetItem(userId, i.item); items.reload(); }}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
