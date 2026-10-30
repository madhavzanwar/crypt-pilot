/** Turns an audit-log entry into a readable sentence. The backend's own detail wins; raw "POST /api/..." strings are mapped by method and path. */

const AREAS: [RegExp, string][] = [
  [/^\/api\/upload\b/, "a bank statement"],
  [/^\/api\/ocr\b/, "a scanned document"],
  [/^\/api\/transactions\b/, "your transactions"],
  [/^\/api\/connectors\b|^\/api\/aa\b/, "a connected source"],
  [/^\/api\/accounts\b/, "your accounts"],
  [/^\/api\/budgets\b/, "your budgets"],
  [/^\/api\/goals\b/, "your goals"],
  [/^\/api\/rules\b/, "your rules"],
  [/^\/api\/expenses\b|^\/expenses\b/, "your expenses"],
  [/^\/api\/documents\b/, "your documents"],
  [/^\/api\/household\b/, "your household"],
  [/^\/api\/profile\b/, "your profile"],
  [/^\/api\/plan\b|^\/api\/planning\b/, "your financial plan"],
  [/^\/api\/forecast\b|^\/api\/risk\b/, "your forecast"],
  [/^\/api\/tax\b/, "your tax estimate"],
  [/^\/api\/networth\b/, "your net worth"],
  [/^\/api\/security\b|^\/api\/wallet\b/, "your security data"],
  [/^\/api\/(copilot|chat)\b/, "the Copilot"],
  [/^\/api\/dashboard\b|^\/api\/insights\b/, "your dashboard"],
];

const VERBS: Record<string, string> = {
  GET: "Viewed",
  POST: "Added or updated",
  PUT: "Updated",
  PATCH: "Updated",
  DELETE: "Removed",
};

export function describeAccess(a: { method?: string; path?: string; detail?: string }): string {
  if (a.detail && a.detail.trim()) return a.detail.trim();
  const path = a.path ?? "";
  const verb = VERBS[(a.method ?? "").toUpperCase()] ?? "Used";
  const area = AREAS.find(([re]) => re.test(path))?.[1];
  if (area) return `${verb} ${area}`;
  return `${verb} your data`;
}
