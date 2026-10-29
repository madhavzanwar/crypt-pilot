/**
 * The statement period ("YYYY-MM") is derived from the data the statement prints, never hard-coded:
 * the month of the latest transaction, capped at the month the snapshot was generated, falling back to the
 * snapshot month. Same data in, same period out, so the audit hash stays reproducible.
 * Pure module (no imports) so it can be unit-tested with plain node.
 */
const MONTH = /^(\d{4})-(\d{2})/;

function monthOf(iso: string | null | undefined): string | null {
  const m = MONTH.exec(iso ?? "");
  if (!m) return null;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12 ? `${m[1]}-${m[2]}` : null;
}

export function statementPeriod(transactions: { date: string }[], generatedAt?: string | null): string {
  const cap = monthOf(generatedAt);
  let latest: string | null = null;
  for (const t of transactions) {
    const m = monthOf(t.date);
    if (m && (!cap || m <= cap) && (!latest || m > latest)) latest = m;
  }
  return latest ?? cap ?? "unknown";
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" -> "01 Sep 2026 – 30 Sep 2026" */
export function periodRangeLabel(period: string): string {
  const m = MONTH.exec(period);
  if (!m) return period;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `01 ${MON[mo - 1]} ${y} – ${String(last).padStart(2, "0")} ${MON[mo - 1]} ${y}`;
}
