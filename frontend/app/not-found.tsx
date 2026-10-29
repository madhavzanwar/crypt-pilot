import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold text-ink">Page not found</h1>
      <p className="text-graphite">That page does not exist or has moved.</p>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-chip bg-lime px-5 font-semibold text-ink">
        Go to the dashboard
      </Link>
    </main>
  );
}
