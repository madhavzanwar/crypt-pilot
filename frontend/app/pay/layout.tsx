import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// Installable as a standalone app (no browser bar) via "Add to Home screen" / "Install app".
export const metadata: Metadata = {
  title: "FinPilot Pay",
  manifest: "/pay.webmanifest",
  appleWebApp: { capable: true, title: "FinPilot Pay", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1a73e8", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function PayLayout({ children }: { children: ReactNode }) {
  return children;
}
