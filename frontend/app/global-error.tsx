"use client";

/** Last-resort boundary for errors in the root layout itself. Must render its own <html>/<body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#ffffff", color: "#0d0d0d" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#475569" }}>The app failed to load. Try again, or reload the page.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#c6f135", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
