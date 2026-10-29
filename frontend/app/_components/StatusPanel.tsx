import Link from "next/link";
import type { ReactNode } from "react";

/** Shared look for error.tsx, global-error.tsx and not-found.tsx (app shell tokens from globals.css). */
export function StatusPanel({ code, title, children, actions }: { code: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="flex min-h-[70vh] flex-1 items-center justify-center bg-paper px-4 py-16 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-ember">{code}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-graphite">{children}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      </div>
    </main>
  );
}

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-chip border border-navy-dark/30 bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-chip border border-mist bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2";

export function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={primary}>
      {children}
    </button>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={primary}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={secondary}>
      {children}
    </Link>
  );
}
