import { PrimaryLink, SecondaryLink, StatusPanel } from "./_components/StatusPanel";

export default function NotFound() {
  return (
    <StatusPanel
      code="404"
      title="Page not found"
      actions={
        <>
          <PrimaryLink href="/dashboard">Go to dashboard</PrimaryLink>
          <SecondaryLink href="/">Home</SecondaryLink>
        </>
      }
    >
      That page does not exist or has moved.
    </StatusPanel>
  );
}
