"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { CHAIN, getWagmiConfig } from "@/lib/crypto/web3Config";
import { lightTheme, RainbowKitProvider, type Theme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

/** Wallet modal theme from FinPilot tokens: Navy accent (same as the primary button), flat, hairline border. */
function useWalletTheme(): Theme {
  return useMemo(() => {
    const root = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
    const base = lightTheme({
      accentColor: v("--color-navy", "#172554"),
      accentColorForeground: v("--color-paper", "#ffffff"),
      borderRadius: "large",
      fontStack: "system",
      overlayBlur: "small",
    });
    return {
      ...base,
      colors: {
        ...base.colors,
        modalBorder: v("--color-mist", "#e0e6f2"),
        generalBorder: v("--color-mist", "#e0e6f2"),
      },
    };
  }, []);
}

/**
 * Wagmi + RainbowKit + react-query around ONE subtree (the attestation flow). Mounted only after the person opens
 * the attestation panel, loaded with next/dynamic (ssr: false), so no wallet code reaches SSR, the build output of
 * any other page, or the first paint. Base Sepolia is the only configured chain (mainnet is not available).
 */
export default function Web3Scope({ children }: { children: ReactNode }) {
  const theme = useWalletTheme();
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={getWagmiConfig()} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact" initialChain={CHAIN}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
