"use client";

// Production (Vercel multi-service project) serves the backend on the same
// origin under /api, so default to relative URLs there; local dev talks to
// the separate uvicorn server. NEXT_PUBLIC_API_URL overrides either.
// Dev uses 127.0.0.1, not "localhost": uvicorn binds IPv4 only, and clients
// that try IPv6 (::1) first wait ~2s per request before falling back.
const configured = process.env.NEXT_PUBLIC_API_URL;
const onLoopback = typeof window === "undefined" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
// A copied .env file can leave NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 on the host: from a deployed site that is the visitor's own machine ("Failed to fetch"), so use the same origin instead.
export const API_URL =
  configured && !onLoopback && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(configured)
    ? ""
    : configured ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

/** Attach the Firebase ID token whenever a user is signed in. Demo-only usage
 * (no signed-in session) omits the header, which the backend already allows
 * for the demo personas. authStateReady() waits for Firebase to restore the
 * persisted session so first-load requests aren't sent anonymously. */
export async function authHeader(): Promise<Record<string, string>> {
  try {
    const { auth: firebaseAuth } = await import("./firebase/config");
    await firebaseAuth.authStateReady();
    if (firebaseAuth.currentUser) {
      const fbToken = await firebaseAuth.currentUser.getIdToken();
      if (fbToken) return { Authorization: `Bearer ${fbToken}` };
    }
  } catch {
    // Firebase auth not available or not signed in
  }
  return {};
}

