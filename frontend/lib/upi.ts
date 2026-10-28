/** UPI QR payloads: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tn=<note>&cu=INR */
export interface UpiTarget {
  upiId: string;
  name: string;
  amount?: number;
  note?: string;
}

export function buildUpiUri({ upiId, name, amount, note }: UpiTarget): string {
  const q = new URLSearchParams({ pa: upiId, pn: name, cu: "INR" });
  if (amount) q.set("am", amount.toFixed(2));
  if (note) q.set("tn", note);
  return `upi://pay?${q.toString()}`;
}

/** Accepts a full upi://pay link or a bare UPI ID (name@bank). Returns null for anything else. */
export function parseUpi(text: string): UpiTarget | null {
  const raw = text.trim();
  if (/^[\w.-]{2,}@[\w.-]{2,}$/.test(raw)) return { upiId: raw, name: raw.split("@")[0] };
  try {
    const u = new URL(raw);
    if (u.protocol !== "upi:") return null;
    const pa = u.searchParams.get("pa") ?? "";
    if (!/^[\w.-]{2,}@[\w.-]{2,}$/.test(pa)) return null;
    const am = Number(u.searchParams.get("am"));
    return {
      upiId: pa,
      name: u.searchParams.get("pn") || pa.split("@")[0],
      amount: am > 0 ? am : undefined,
      note: u.searchParams.get("tn") || undefined,
    };
  } catch {
    return null;
  }
}
