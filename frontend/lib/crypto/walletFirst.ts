/**
 * A chat message that contains a wallet address is a wallet question: the wallet card comes first, and the
 * backend's generic "I didn't quite catch that" money snapshot (what basic mode answers to anything it cannot
 * route) is not shown. A real answer to another part of the message is still shown, below the card.
 */
const GENERIC = /i didn['’]t quite catch that/i;

export function isGenericFallbackAnswer(narrative: string | null | undefined): boolean {
  return GENERIC.test(narrative ?? "");
}

/** Whether the assistant's text bubble is shown under a user message that holds `walletCount` wallet cards. */
export function showAnswerBubble(walletCount: number, narrative: string | null | undefined): boolean {
  return walletCount === 0 || !isGenericFallbackAnswer(narrative);
}
