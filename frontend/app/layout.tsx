import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://finpilot.ai"),
  title: "CryptPilot",
  description:
    "AI x crypto: a personal-finance copilot with 90-day Monte Carlo cash-flow forecasts, plus graph-verified Bitcoin wallet risk checks with plain-language, multilingual explanations.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "CryptPilot",
    description:
      "AI x crypto: personal-finance copilot and graph-verified Bitcoin wallet risk checks.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CryptPilot" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CryptPilot",
    description:
      "AI x crypto: personal-finance copilot and graph-verified Bitcoin wallet risk checks.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

import { CurrencyProvider } from "@/lib/currency";
import { ThemeProvider } from "next-themes";
import { AutoTranslate } from "@/components/AutoTranslate";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CurrencyProvider>{children}</CurrencyProvider>
        </ThemeProvider>
        <AutoTranslate />
      </body>
    </html>
  );
}
