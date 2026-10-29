import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// Installable as a standalone app (no browser bar) via "Add to Home screen" / "Install app".
export const metadata: Metadata = {
  title: "FinPilot Pay (demo, test mode)",
  manifest: "/pay.webmanifest",
  appleWebApp: { capable: true, title: "FinPilot Pay (demo, test mode)", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1a73e8", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Every /pay screen (including /pay/qr) carries the demo label: nothing here moves real money.
export default function PayLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        role="note"
        className="fixed inset-x-0 top-0 z-[60] bg-[#fef7e0] py-0.5 text-center text-[11px] font-medium leading-4 text-[#7a5c00] pointer-events-none"
      >
        Demo / test mode: no real money moves and nothing is sent to a bank.
      </div>
      <main className="pt-5">{children}</main>
    </>
  );
}
