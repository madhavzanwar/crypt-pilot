"use client";

import { useEffect } from "react";
import { PrimaryButton, SecondaryLink, StatusPanel } from "./_components/StatusPanel";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPanel
      code={error.digest ? `Error ${error.digest}` : "Error"}
      title="Something went wrong"
      actions={
        <>
          <PrimaryButton onClick={reset}>Try again</PrimaryButton>
          <SecondaryLink href="/dashboard">Go to dashboard</SecondaryLink>
        </>
      }
    >
      This page hit an unexpected error. Your data is untouched. Try again, or head back to the dashboard.
    </StatusPanel>
  );
}
