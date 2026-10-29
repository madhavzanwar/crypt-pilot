"use client";

import { useEffect } from "react";

/** Route-level error boundary: a render exception shows a recoverable message instead of the bare Next error page. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="text-graphite">This page hit an unexpected error. Your data is untouched. Try again, or reload.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-chip bg-lime px-5 font-semibold text-ink"
      >
        Try again
      </button>
    </main>
  );
}
