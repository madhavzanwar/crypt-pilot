import { clearApiCache } from "@/lib/api";
import { API_URL, authHeader } from "@/lib/apiBase";

// Base-URL and auth rules are shared with lib/api.ts. The councils' own methods there send no request body, and the
// wallets to screen travel in the body, so these two calls live here.

/** POST a JSON body and read the NDJSON stream line by line. */
export async function postNdjson<E>(path: string, body: unknown, onEvent: (e: E) => void, failed: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body), signal });
  clearApiCache();
  if (!res.ok || !res.body) throw new Error(`${failed}: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const emit = (line: string) => {
    if (!line.trim()) return;
    let ev: E;
    try {
      ev = JSON.parse(line) as E;
    } catch {
      return; // skip a malformed line rather than abort the whole stream
    }
    if (!signal?.aborted) onEvent(ev);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(emit);
  }
  buf += dec.decode();
  emit(buf);
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? "";
    } catch {
      // no JSON body
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
