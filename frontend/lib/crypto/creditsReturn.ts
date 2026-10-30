export const POLL_TIMES = 10;

export type ReturnView = "confirmed" | "none" | "checking" | "unconfirmed";

/**
 * What /credits/success shows. Opened directly (no status from Dodo) there is no payment to wait for, so it never
 * sits on "Checking"; with a status that is not a success it checks for POLL_TIMES polls and then says it could not confirm.
 */
export function returnView(status: string, tries: number): ReturnView {
  const s = status.toLowerCase();
  if (["succeeded", "success", "paid", "completed"].includes(s)) return "confirmed";
  if (s === "") return "none";
  return tries < POLL_TIMES ? "checking" : "unconfirmed";
}
