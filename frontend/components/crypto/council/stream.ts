import { clearApiCache } from "@/lib/api";

// Same base-URL and auth rules as lib/api.ts (which does not export them). The councils' own methods there send no
// request body, and the wallets to screen travel in the body, so these two calls live here.
const configured = process.env.NEXT_PUBLIC_API_URL;
const onLoopback = typeof window === "undefined" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
const API_URL =
  configured && !onLoopback && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(configured)
    ? ""
    : configured ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import("@/lib/firebase/config");
    await auth.authStateReady();
    if (auth.currentUser) return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
  } catch {
    // not signed in: the demo personas are allowed without a token
  }
  return {};
}

/** POST a JSON body and read the NDJSON stream line by line. */
export async function postNdjson<E>(path: string, body: unknown, onEvent: (e: E) => void, failed: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
  clearApiCache();
  if (!res.ok || !res.body) throw new Error(`${failed}: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.filter(Boolean).forEach((l) => onEvent(JSON.parse(l) as E));
  }
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
