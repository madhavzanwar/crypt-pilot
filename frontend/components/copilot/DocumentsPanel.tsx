"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Upload / list / delete the documents FinPilot reads when answering. */
export function DocumentsPanel({ userId }: { userId: string }) {
  const docs = useAsync(useCallback(() => api.documents(userId), [userId]), [userId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) await api.uploadDocument(userId, f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
    setBusy(false);
    docs.reload();
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.deleteDocument(userId, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
    docs.reload();
  }

  return (
    <div className="rounded-2xl bg-sage/60 p-3 text-sm">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files);
        }}
        className={cn("flex items-center gap-3 rounded-xl border border-dashed border-olive/40 bg-white px-3 py-2.5", drag && "bg-tint-lime")}
      >
        {busy ? <Loader2 className="size-4 animate-spin text-olive" /> : <Upload className="size-4 text-olive" />}
        <span className="flex-1 text-xs text-graphite">{busy ? "Uploading…" : "Drop files here (.txt .md .csv .json, up to 2 MB)"}</span>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="cursor-pointer rounded-lg bg-lime px-2.5 py-1 text-xs font-semibold text-ink hover:bg-lime/70 disabled:opacity-50">
          Choose file
        </button>
        <input ref={input} type="file" multiple accept=".txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      {docs.data && docs.data.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {docs.data.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-ink">
              <FileText className="size-3.5 shrink-0 text-pewter" />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-pewter tnum">{Math.max(1, Math.round(d.chars / 1024))} KB</span>
              <button type="button" aria-label={`Delete ${d.name}`} onClick={() => remove(d.id)} className="cursor-pointer text-pewter hover:text-rose-600">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-pewter">FinPilot reads these when answering. Stored on your account only.</p>
    </div>
  );
}
