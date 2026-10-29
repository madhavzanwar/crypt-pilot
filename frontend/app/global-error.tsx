"use client";

import "./globals.css";
import { useEffect } from "react";
import { PrimaryButton, StatusPanel } from "./_components/StatusPanel";

// Replaces the root layout when it crashes, so it must render its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <StatusPanel
          code={error.digest ? `Error ${error.digest}` : "Error"}
          title="CryptPilot hit a problem"
          actions={<PrimaryButton onClick={reset}>Reload</PrimaryButton>}
        >
          The app could not load. Reload to try again.
        </StatusPanel>
      </body>
    </html>
  );
}
