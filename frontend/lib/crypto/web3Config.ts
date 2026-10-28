import { WALLETCONNECT_PROJECT_ID } from "@/lib/crypto/env";
import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, type Config } from "wagmi";
import { baseSepolia } from "wagmi/chains";

/**
 * Wagmi config for Base Sepolia ONLY (chain id 84532, a test network: no real money, MAINNET IS NOT CONFIGURED).
 * Heavy: import it only from the lazily loaded web3 chunk (components/crypto/web3/AttestScope), never from the
 * main bundle or from a server component.
 */
export const CHAIN = baseSepolia;

/** Without a WalletConnect (Reown) project id only browser/extension wallets are offered. */
export const HAS_WALLETCONNECT = WALLETCONNECT_PROJECT_ID !== "";

let cached: Config | undefined;

export function getWagmiConfig(): Config {
  if (cached) return cached;
  const transports = { [baseSepolia.id]: http() };
  if (HAS_WALLETCONNECT) {
    cached = getDefaultConfig({
      appName: "CryptPilot",
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [baseSepolia],
      transports,
      ssr: false,
    });
  } else {
    const connectors = connectorsForWallets(
      [{ groupName: "Browser wallets", wallets: [injectedWallet, coinbaseWallet] }],
      { appName: "CryptPilot", projectId: "no-walletconnect-project-id" },
    );
    cached = createConfig({ chains: [baseSepolia], connectors, transports, ssr: false });
  }
  return cached;
}
