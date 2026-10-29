import type { ChainWallet } from "./types";

/** Joins sentences without a doubled full stop ("... right now. . The findings" -> "... right now. The findings"). */
export function tidyText(text: string): string {
  return text.replace(/([^.\s])\.(?:\s+\.|\.(?!\.))(?!\.)/g, "$1.").replace(/\s{2,}/g, " ").trim();
}

export interface WalletSummary {
  blocked: string[];
  unchecked: string[];
  /** Every listed wallet was unverified (not in the dataset or the service was offline): the score says nothing about them. */
  allUnchecked: boolean;
}

export function summariseWallets(wallets: ChainWallet[] | undefined): WalletSummary {
  const list = wallets ?? [];
  const blocked = list.filter((w) => w.verdict === "BLOCK").map((w) => w.address);
  const unchecked = list.filter((w) => w.status !== "ok" || w.verdict === "UNKNOWN" || !w.verdict).map((w) => w.address);
  return { blocked, unchecked, allUnchecked: list.length > 0 && unchecked.length === list.length };
}

/** The council's actions plus a "do not send" line for every BLOCK wallet the text does not already name. */
export function actionsWithBlocked(actions: string[] | undefined, blocked: string[]): string[] {
  const base = (actions ?? []).map(tidyText);
  const joined = base.join(" ");
  const missing = blocked.filter((a) => !joined.includes(a));
  return [...base, ...missing.map((a) => `Do not send funds to ${a}.`)];
}
