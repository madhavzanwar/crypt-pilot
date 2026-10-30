import { extractErrorMessage, formatApiError, photoErrorMessage, SecretInputError, secretInputDetail } from "@/lib/apiError";
import { TranslateCache } from "@/lib/translateCache";
import { getLang, getSimpleNow } from "@/lib/i18n";

import type {
  OpsOverview,
  OpsProbe,
  Account,
  AnswerContract,
  ChatEngine,
  SchemesFeed,
  Budget,
  BudgetStatus,
  CategorizationRule,
  CategorizationRuleCreate,
  CategorizationRuleList,
  CreateAccountRequest,
  CreateBudgetRequest,
  CreateGoalRequest,
  CreateHouseholdRequest,
  CreateInviteRequest,
  DashboardSnapshot,
  DocumentInfo,
  OcrPreview,
  SnapResult,
  TaughtItem,
  OcrTxn,
  Goal,
  GoalProgress,
  FinancialSecurity,
  FinancialSecurityBrief,
  Profile,
  ProfileLevel,
  ProfileQuestion,
  Household,
  DeleteMyDataResult,
  SharedExpensesSummary,
  AddSharedExpenseRequest,
  AddSettlementRequest,
  HouseholdInvite,
  HouseholdSummary,
  AddManagedMemberRequest,
  AddManagedTransactionRequest,
  MemberLedger,
  HouseholdInsights,

  NetWorthHistory,
  Connector,
  ConnectProfile,
  NotificationItem,
  PlanParams,
  PayResult, PayReviewItem,
  ForecastRiskQuery,
  ForecastRiskReport,
  PlanResult,
  PlanScenario,
  PlanScenarioSummary,
  PlanShock,
  RecomputeDiff,
  CopilotInsight,
  ReplanResult,
  ReviewQueueResponse,
  ReviewTransactionRequest,
  SafeToSpend,
  SimulationRequest,
  SimulationResult,
  TaxCalculationRequest,
  TaxOptimizationAnalysis,
  Transaction,
  TransactionFilters,
  TransactionPage,
  TransactionUpdate,
  UpdateBudgetRequest,
  UpdateGoalRequest,
  SecurityEvent,
  CouncilEvent,
  SecurityFinding,
  SecurityGraph,
  SecurityReport,
  MyData,
  HouseholdSpending,
} from "./types";
import { publishCopilotInsights } from "./copilotBus";
import { DATA_CHANGED_EVENT } from "./hooks";
import { getOfflineOnly } from "./user";

import { API_URL, authHeader } from "./apiBase";

// Stale-while-revalidate cache for GET responses, so switching tabs shows data instantly and identical in-flight
// requests share one fetch. Within FRESH_MS an entry is served with no network at all; up to STALE_MS it is still
// served instantly while one quiet background refetch replaces it (mounted pages refresh only if the data changed).
// Every write clears it, so edits never look stale.
const FRESH_MS = 60_000;
const STALE_MS = 10 * 60_000;
const MAX_ENTRIES = 200;
type CacheEntry = { at: number; value: Promise<unknown>; refreshing?: boolean };
const getCache = new Map<string, CacheEntry>();
export const clearApiCache = () => getCache.clear();

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
/** One debounced "data changed" for however many background refreshes finish together. */
function scheduleViewRefresh() {
  if (typeof window === "undefined") return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => window.dispatchEvent(new Event(DATA_CHANGED_EVENT)), 150);
}

/** After a successful write, tell every mounted useAsync() to refetch. */
function notifyIfWrite(method?: string) {
  if (method && method !== "GET" && typeof window !== "undefined") {
    clearApiCache();
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
}

function publishInsights(d: RecomputeDiff): RecomputeDiff {
  if (d.insights?.length) publishCopilotInsights(d.insights);
  return d;
}

function revalidate(path: string, init: RequestInit | undefined, old: CacheEntry) {
  if (old.refreshing) return;
  old.refreshing = true;
  request<unknown>(path, init)
    .then(async (fresh) => {
      if (getCache.get(path) !== old) return; // a write cleared or replaced it meanwhile
      const prev = await old.value.catch(() => undefined);
      getCache.set(path, { at: Date.now(), value: Promise.resolve(fresh) });
      if (JSON.stringify(prev) !== JSON.stringify(fresh)) scheduleViewRefresh();
    })
    .catch(() => {
      old.refreshing = false; // keep serving the stale copy and try again on the next visit
    });
}

function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && init.method !== "GET") return request<T>(path, init);
  const hit = getCache.get(path);
  if (hit) {
    const age = Date.now() - hit.at;
    if (age < FRESH_MS) return hit.value as Promise<T>;
    if (age < STALE_MS) {
      revalidate(path, init, hit);
      return hit.value as Promise<T>;
    }
  }
  if (getCache.size >= MAX_ENTRIES) getCache.delete(getCache.keys().next().value as string); // oldest first
  const value = request<T>(path, init);
  getCache.set(path, { at: Date.now(), value });
  value.catch(() => getCache.delete(path)); // never keep a failed request
  return value;
}

/** Friendly message for a failed response (see lib/apiError.ts); technical detail goes to the console only. */
async function errorMessage(path: string, res: Response): Promise<string> {
  const text = await res.text();
  const secret = secretInputDetail(res.status, text);
  if (secret) throw new SecretInputError(secret);
  if (res.status >= 500 || res.status === 422) console.error(`API ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  return formatApiError(res.status, text);
}

const pairHeader = (code?: string): Record<string, string> => (code ? { "X-Pair-Code": code } : {});

async function liveGet<T>(path: string, code?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", headers: { ...(await authHeader()), ...pairHeader(code) } });
  if (!res.ok) throw new Error(await errorMessage(path, res));
  return res.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...auth, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(path, res));
  }
  notifyIfWrite(init?.method);
  // DELETE endpoints (e.g. budgets/goals) return 204 with no body -- res.json()
  // would throw on the empty string, so short-circuit for callers typed <void>.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function planQuery(p: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// One cache per tab: never ask the server for the same string twice, and back off after a failure (see lib/translateCache.ts).
const translations = new TranslateCache(
  async (lang, texts) => (await request<{ translations: Record<string, string> }>("/api/translate", { method: "POST", body: JSON.stringify({ lang, texts }) })).translations,
  () => (typeof window === "undefined" ? null : window.localStorage),
);

/** Failed /api/ocr/extract call: keeps the HTTP status so the UI can pick a friendly message or fall back to the CSV importer. */
export class ExtractError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(extractErrorMessage(status, detail));
    this.name = "ExtractError";
    this.status = status;
    this.detail = detail;
  }
}

export const api = {
  health: () => apiFetch<{ status: string }>("/api/health"),
  /** English UI text -> Hindi/Marathi (server caches; used only for text nobody hand-translated). */
  translateTexts: async (lang: string, texts: string[]) => ({
    translations: await translations.translate(lang, texts),
  }),
  voiceAct: (text: string, path: string, lang: string, screen: unknown, history: string[], userId = "") =>
    apiFetch<{ thinking?: string; say: string; ask_copilot: boolean; actions: import("@/lib/voiceAgent").VoiceAction[] }>("/api/voice/act", { method: "POST", body: JSON.stringify({ text, path, lang, screen, history, user_id: userId }) }),
  schemeAnalyst: (scheme: string, question: string) =>
    apiFetch<import("@/lib/types").SchemeAnalysis>("/api/web/scheme-analyst", { method: "POST", body: JSON.stringify({ scheme, question }) }),
  web: (kind: "search" | "extract" | "crawl" | "map", body: Record<string, string>) =>
    apiFetch<{ answer?: string; results?: Record<string, unknown>[]; failed_results?: unknown[]; base_url?: string }>(`/api/web/${kind}`, { method: "POST", body: JSON.stringify(body) }),
  opsOverview: () => request<OpsOverview>("/api/ops/overview"),
  opsProbe: (env: string) => request<OpsProbe>(`/api/ops/probe/${env}`, { method: "POST" }),
  dashboard: (userId: string) => apiFetch<DashboardSnapshot>(`/api/dashboard/${userId}`),
  // user_id must be threaded through explicitly -- ChatRequest defaults to
  // "demo-priya" server-side, so omitting it here would silently ignore
  // whatever persona the rest of the app (dashboard/simulate/timeline, all
  // of which use useUserId()) is currently showing.
  chat: (message: string, userId: string, model: ChatEngine = "auto", history: { role: "user" | "assistant"; content: string }[] = []) =>
    apiFetch<AnswerContract>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, user_id: userId, force_offline: getOfflineOnly(), model, history, language: getLang(), simple: getSimpleNow() }),
    }),
  schemes: () => apiFetch<SchemesFeed>("/api/schemes"),
  simulate: (userId: string, req: SimulationRequest) =>
    apiFetch<SimulationResult>(`/api/simulate/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  addEvent: (userId: string, payload: Record<string, unknown>) =>
    apiFetch<RecomputeDiff>(`/api/events/${userId}`, { method: "POST", body: JSON.stringify(payload) }).then(publishInsights),
  copilotInsights: (userId: string, since?: string) =>
    apiFetch<CopilotInsight[]>(`/api/copilot/insights/${userId}?limit=20${since ? `&since=${encodeURIComponent(since)}` : ""}`),

  // Transactions
  transactions: (userId: string, filters: TransactionFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return apiFetch<TransactionPage>(`/api/transactions/${userId}${qs ? `?${qs}` : ""}`);
  },
  updateTransaction: (userId: string, transactionId: string, update: TransactionUpdate) =>
    apiFetch<Transaction>(`/api/transactions/${userId}/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    }),
  reviewQueue: (userId: string, limit = 20) =>
    apiFetch<ReviewQueueResponse>(`/api/transactions/${userId}/review-queue?limit=${limit}`),
  reviewTransaction: (userId: string, transactionId: string, req: ReviewTransactionRequest) =>
    apiFetch<Transaction>(`/api/transactions/${userId}/${transactionId}/review`, {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Categorization Rules
  rules: (userId: string) => apiFetch<CategorizationRuleList>(`/api/rules/${userId}`),
  createRule: (userId: string, req: CategorizationRuleCreate) =>
    apiFetch<CategorizationRule>(`/api/rules/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  deleteRule: (userId: string, ruleId: string) =>
    apiFetch<{ ok: boolean; deleted_id: string }>(`/api/rules/${userId}/${ruleId}`, { method: "DELETE" }),

  // Budgets
  budgets: (userId: string) => apiFetch<Budget[]>(`/api/budgets/${userId}`),
  createBudget: (userId: string, req: CreateBudgetRequest) =>
    apiFetch<Budget>(`/api/budgets/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  updateBudget: (userId: string, budgetId: string, req: UpdateBudgetRequest) =>
    apiFetch<Budget>(`/api/budgets/${userId}/${budgetId}`, { method: "PATCH", body: JSON.stringify(req) }),
  deleteBudget: (userId: string, budgetId: string) =>
    apiFetch<void>(`/api/budgets/${userId}/${budgetId}`, { method: "DELETE" }),
  budgetStatus: (userId: string) => apiFetch<BudgetStatus[]>(`/api/budgets/${userId}/status`),
  safeToSpend: (userId: string) => apiFetch<SafeToSpend>(`/api/budgets/${userId}/safe-to-spend`),

  // Goals
  goals: (userId: string) => apiFetch<GoalProgress[]>(`/api/goals/${userId}`),
  createGoal: (userId: string, req: CreateGoalRequest) =>
    apiFetch<GoalProgress | Goal>(`/api/goals/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  updateGoal: (userId: string, goalId: string, req: UpdateGoalRequest) =>
    apiFetch<Goal>(`/api/goals/${userId}/${goalId}`, { method: "PATCH", body: JSON.stringify(req) }),
  deleteGoal: (userId: string, goalId: string) =>
    apiFetch<void>(`/api/goals/${userId}/${goalId}`, { method: "DELETE" }),

  /** Indian retailers' prices and offers for an item within a budget (Croma, Vijay Sales, Amazon...). */
  goalDeals: (item: string, budget: number) =>
    apiFetch<{ answer?: string | null; offers: { store: string; title: string; url: string; favicon?: string | null; price: number | null; within_budget: boolean }[] }>(
      "/api/web/deals", { method: "POST", body: JSON.stringify({ item, budget }) }),

  // Connectors: linking a source is what fills the app with data
  connectors: (userId: string) => apiFetch<Connector[]>(`/api/connectors/${userId}`),
  /** Account Aggregator: ask consent, approve with the OTP, then import the bank data. */
  aaConsent: (userId: string, mobile: string, profile: ConnectProfile, returnUrl: string) =>
    apiFetch<{ handle: string; demo_otp?: string; redirect_url?: string }>(`/api/aa/${userId}/consent`, { method: "POST", body: JSON.stringify({ mobile, profile, return_url: returnUrl }) }),
  aaApprove: (userId: string, handle: string, otp: string) =>
    apiFetch<{ consent_id: string }>(`/api/aa/${userId}/consent/approve`, { method: "POST", body: JSON.stringify({ handle, otp }) }),
  aaImport: (userId: string, consentId: string) =>
    apiFetch<{ accounts: number; transactions: number }>(`/api/aa/${userId}/import`, { method: "POST", body: JSON.stringify({ consent_id: consentId }) }),
  connectConnector: (userId: string, connector: string, profile: ConnectProfile, url = "") =>
    apiFetch<{ connected: boolean; accounts: number; transactions: number; has_data?: boolean; message?: string }>(
      `/api/connectors/${userId}/${connector}/connect`,
      { method: "POST", body: JSON.stringify({ profile, url }) }
    ),
  /** Re-reads the linked Google Sheet. Only announces a data change when the sheet actually changed. */
  syncSheet: async (userId: string): Promise<boolean> => {
    const res = await fetch(`${API_URL}/api/connectors/${userId}/google_sheets/sync`, { method: "POST", headers: await authHeader() });
    clearApiCache();
    if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
    const { changed } = (await res.json()) as { changed: boolean };
    if (changed) notifyIfWrite("POST");
    return changed;
  },
  /** Downloads a connected source's dataset as a CSV file. */
  exportConnector: async (userId: string, connector: string) => {
    const res = await fetch(`${API_URL}/api/connectors/${userId}/${connector}/export`, { headers: await authHeader() });
    if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `${connector}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  },
  disconnectConnector: (userId: string, connector: string) =>
    apiFetch<void>(`/api/connectors/${userId}/${connector}`, { method: "DELETE" }),

  // Security suite: Evidence Room, Twin Simulator, My Data
  /** Streams agent progress events (NDJSON); the last event is the saved report. */
  investigate: async (userId: string, onEvent: (e: SecurityEvent) => void) => {
    const res = await fetch(`${API_URL}/api/security/${userId}/investigate`, { method: "POST", headers: await authHeader() });
    clearApiCache();
    if (!res.ok || !res.body) throw new Error(`Investigation failed: ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.filter(Boolean).forEach((l) => onEvent(JSON.parse(l)));
    }
  },
  /** Streams the Risk Council: one event per agent vote, then the verdict. */
  convene: async (userId: string, onEvent: (e: CouncilEvent) => void) => {
    const res = await fetch(`${API_URL}/api/security/${userId}/council`, { method: "POST", headers: await authHeader() });
    if (!res.ok || !res.body) throw new Error(`Council failed: ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.filter(Boolean).forEach((l) => onEvent(JSON.parse(l)));
    }
  },
  profileQuestions: () => apiFetch<Record<ProfileLevel, ProfileQuestion[]>>("/api/profile/questions"),
  profile: (userId: string) => apiFetch<Profile>(`/api/profile/${userId}`),
  saveProfile: (userId: string, level: ProfileLevel | "skipped", answers: Record<string, string> = {}) =>
    apiFetch<Profile>(`/api/profile/${userId}`, { method: "PUT", body: JSON.stringify({ level, answers }) }),
  financialSecurity: (userId: string) => apiFetch<FinancialSecurity>(`/api/security/${userId}/financial`),
  financialSecurityBrief: (userId: string) => apiFetch<FinancialSecurityBrief>(`/api/security/${userId}/financial/brief`),
  securityReport: (userId: string) => apiFetch<SecurityReport | null>(`/api/security/${userId}/report`),
  plantThreats: (userId: string) => apiFetch<{ planted: number }>(`/api/security/${userId}/demo-threats`, { method: "POST" }),
  clearThreats: (userId: string) => apiFetch<{ removed: number }>(`/api/security/${userId}/demo-threats`, { method: "DELETE" }),
  securityGraph: (userId: string, months: number) => apiFetch<SecurityGraph>(`/api/security/${userId}/graph?months=${months}`),
  simulateFraud: (userId: string, merchant: string, amount: number) =>
    apiFetch<{ caught: boolean; outcome?: "caught" | "unverified" | "not_flagged"; findings: SecurityFinding[] }>(`/api/security/${userId}/simulate-fraud`, { method: "POST", body: JSON.stringify({ merchant, amount }) }),
  myData: (userId: string) => apiFetch<MyData>(`/api/security/${userId}/data`),
  exportAllData: async (userId: string) => {
    const res = await fetch(`${API_URL}/api/security/${userId}/data/export`, { headers: await authHeader() });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href: url, download: "finpilot-all-data.json" }).click();
    URL.revokeObjectURL(url);
  },

  // Net worth + accounts
  netWorthHistory: (userId: string, days = 180) =>
    apiFetch<NetWorthHistory>(`/api/networth/${userId}/history?days=${days}`),
  accounts: (userId: string) => apiFetch<Account[]>(`/api/accounts/${userId}`),
  createAccount: (userId: string, req: CreateAccountRequest) =>
    apiFetch<Account>(`/api/accounts/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  /** Bank-statement CSV upload (multipart -- so no JSON Content-Type header). */
  upload: async (userId: string, file: File): Promise<RecomputeDiff> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/api/upload/${userId}`, {
      method: "POST",
      headers: await authHeader(),
      body,
    });
    if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
    notifyIfWrite("POST");
    return publishInsights((await res.json()) as RecomputeDiff);
  },

  // Documents the Copilot reads when answering (.txt .md .csv .json, <=2MB)
  documents: (userId: string) => apiFetch<DocumentInfo[]>(`/api/documents/${userId}`),
  uploadDocument: async (userId: string, file: File): Promise<{ id: string; name: string; chars: number; chunks: number }> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/api/documents/${userId}`, { method: "POST", headers: await authHeader(), body });
    clearApiCache();
    if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
    return res.json();
  },
  // Statement / passbook photo -> OCR -> personal data removed -> preview; nothing is saved until importOcr
  extractStatement: async (userId: string, file: File): Promise<OcrPreview> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/api/ocr/extract/${userId}`, { method: "POST", headers: await authHeader(), body });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null))?.detail;
      throw new ExtractError(res.status, typeof detail === "string" ? detail : "");
    }
    return res.json();
  },
  importOcr: (userId: string, transactions: OcrTxn[]) =>
    apiFetch<{ imported: number; skipped_repeats: number }>(`/api/ocr/import/${userId}`, { method: "POST", body: JSON.stringify({ transactions }) }).finally(clearApiCache),
  // One line of spending (item + amount); the backend files it under a category
  addExpense: async (userId: string, item: string, amount: number, photo?: File) => {
    const body = new FormData();
    body.append("item", item);
    body.append("amount", String(amount));
    if (photo) body.append("photo", photo);
    const res = await fetch(`${API_URL}/api/expenses/${userId}`, { method: "POST", headers: await authHeader(), body });
    clearApiCache();
    if (!res.ok) throw new Error(photoErrorMessage(res.status, (await res.json().catch(() => null))?.detail, "Could not save that item."));
    return res.json();
  },
  // Photo -> price memory: teach once (photo + name + price), then a photo alone books the expense
  teachItem: async (userId: string, item: string, price: number, photo: File) => {
    const body = new FormData();
    body.append("item", item);
    body.append("price", String(price));
    body.append("photo", photo);
    const res = await fetch(`${API_URL}/api/expenses/${userId}/teach`, { method: "POST", headers: await authHeader(), body });
    clearApiCache();
    if (!res.ok) throw new Error(photoErrorMessage(res.status, (await res.json().catch(() => null))?.detail, "Could not save that item."));
    return res.json() as Promise<{ item: string; price: number }>;
  },
  snapPhoto: async (userId: string, photo: File): Promise<SnapResult> => {
    const body = new FormData();
    body.append("photo", photo);
    const res = await fetch(`${API_URL}/api/expenses/${userId}/snap`, { method: "POST", headers: await authHeader(), body });
    clearApiCache();
    if (!res.ok) throw new Error(photoErrorMessage(res.status, (await res.json().catch(() => null))?.detail, "Could not read that photo."));
    return res.json();
  },
  /** Phone pay app: books a scanned-QR payment into the ledger (no real money moves). `code` is the pairing code from the dashboard. */
  pay: (userId: string, body: { payee_name: string; upi_id: string; amount: number; note?: string }, code?: string) =>
    apiFetch<PayResult>(`/api/pay/${userId}`, { method: "POST", body: JSON.stringify(body), headers: pairHeader(code) }),
  /** Signed-in website: mint a code so the phone app can pay into this account. */
  payPair: (userId: string) => apiFetch<{ code: string; expires_in_days: number }>(`/api/pay/${userId}/pair`, { method: "POST" }),
  payPairStatus: (userId: string, code?: string) => liveGet<{ claimed: boolean; connected: boolean }>(`/api/pay/${userId}/pair${code ? `?code=${encodeURIComponent(code)}` : ""}`),
  /** The next three are uncached on purpose (apiFetch reuses GETs for 30s) and send the sign-in token, or the pairing code on the phone. */
  payReviews: (userId: string, limit = 3, code?: string) => liveGet<PayReviewItem[]>(`/api/pay/${userId}/reviews?limit=${limit}`, code),
  payHistory: (userId: string, code?: string) =>
    liveGet<{ id: string; merchant: string; amount: number; date: string; category: string }[]>(`/api/pay/${userId}/history`, code),
  payLimit: (userId: string) => liveGet<{ per_payment: number | null }>(`/api/pay/${userId}/limit`),
  setPayLimit: (userId: string, per_payment: number | null) =>
    apiFetch<{ per_payment: number | null }>(`/api/pay/${userId}/limit`, { method: "PUT", body: JSON.stringify({ per_payment }) }),
  payLive: (userId: string, code?: string) => liveGet<{ version: number }>(`/api/pay/${userId}/live`, code),
  setPayReviewStatus: (userId: string, id: string, status: "confirmed" | "reported") =>
    apiFetch<{ id: string; status: string }>(`/api/pay/${userId}/reviews/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  taughtItems: (userId: string) => apiFetch<TaughtItem[]>(`/api/expenses/${userId}/items`),
  forgetItem: (userId: string, item: string) => apiFetch<unknown>(`/api/expenses/${userId}/items/${encodeURIComponent(item)}`, { method: "DELETE" }).finally(clearApiCache),
  deleteDocument: (userId: string, id: string) =>
    apiFetch<unknown>(`/api/documents/${userId}/${id}`, { method: "DELETE" }),

  // Financial plan (constrained action planner + monthly probabilistic forecast)
  plan: (userId: string, p: PlanParams = {}) =>
    apiFetch<PlanResult>(`/api/plan/${userId}${planQuery(p)}`),
  forecastRisk: (userId: string, q: ForecastRiskQuery = {}) =>
    apiFetch<ForecastRiskReport>(`/api/forecast-risk/${userId}${planQuery(q)}`),
  replan: (userId: string, p: PlanParams, shock: PlanShock) =>
    apiFetch<ReplanResult>(`/api/plan/${userId}/replan`, { method: "POST", body: JSON.stringify({ ...p, shock }) }),
  // Public (synthetic data) -- no user id.
  planScenarios: () => apiFetch<PlanScenarioSummary[]>("/api/planning/scenarios"),
  planScenario: (name: string) => apiFetch<PlanScenario>(`/api/planning/scenarios/${name}`),

  // Notifications
  notifications: (userId: string) => apiFetch<NotificationItem[]>(`/api/notifications/${userId}`),

  // Delete my data: irreversible. The server needs the exact confirmation text; the GET cache is always cleared afterwards.
  deleteMyData: (userId: string) =>
    apiFetch<DeleteMyDataResult>(`/api/my-data/${encodeURIComponent(userId)}/delete`, {
      method: "POST",
      body: JSON.stringify({ confirm: "DELETE MY DATA" }),
    }).finally(clearApiCache),

  // Shared expenses ("Who owes who"). GET is null when the user has no household.
  getSharedExpenses: (userId: string) => apiFetch<SharedExpensesSummary | null>(`/api/household/${encodeURIComponent(userId)}/shared-expenses`),
  addSharedExpense: (userId: string, req: AddSharedExpenseRequest) =>
    apiFetch<SharedExpensesSummary>(`/api/household/${encodeURIComponent(userId)}/shared-expenses`, { method: "POST", body: JSON.stringify(req) }).finally(clearApiCache),
  deleteSharedExpense: (userId: string, expenseId: string) =>
    apiFetch<SharedExpensesSummary>(`/api/household/${encodeURIComponent(userId)}/shared-expenses/${encodeURIComponent(expenseId)}`, { method: "DELETE" }).finally(clearApiCache),
  addSettlement: (userId: string, req: AddSettlementRequest) =>
    apiFetch<SharedExpensesSummary>(`/api/household/${encodeURIComponent(userId)}/settlements`, { method: "POST", body: JSON.stringify(req) }).finally(clearApiCache),

  // Household & Collaboration (Pillar 5D)
  household: (userId: string) => apiFetch<HouseholdSummary>(`/api/household/${userId}`),
  householdSpending: (userId: string, days = 30) =>
    apiFetch<HouseholdSpending>(`/api/household/${userId}/spending?days=${days}`),
  createHousehold: (userId: string, req: CreateHouseholdRequest) =>
    apiFetch<HouseholdSummary>(`/api/household/${userId}`, { method: "POST", body: JSON.stringify(req) }),
  createInvite: (userId: string, req: CreateInviteRequest) =>
    apiFetch<HouseholdInvite>(`/api/household/${userId}/invites`, { method: "POST", body: JSON.stringify(req) }),
  acceptInvite: (userId: string, token: string) =>
    apiFetch<HouseholdSummary>(`/api/household/${userId}/invites/accept`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  revokeInvite: (userId: string, inviteId: string) =>
    apiFetch<{ revoked: boolean; id: string }>(`/api/household/${userId}/invites/${inviteId}`, { method: "DELETE" }),
  addManagedMember: (userId: string, req: AddManagedMemberRequest) =>
    apiFetch<HouseholdSummary>(`/api/household/${userId}/managed-members`, { method: "POST", body: JSON.stringify(req) }),
  householdInsights: (userId: string) => apiFetch<HouseholdInsights>(`/api/household/${userId}/insights`),
  memberLedger: (userId: string, memberUserId: string) =>
    apiFetch<MemberLedger>(`/api/household/${userId}/members/${memberUserId}/ledger`),
  addManagedTransaction: (userId: string, memberUserId: string, req: AddManagedTransactionRequest) =>
    apiFetch<MemberLedger>(`/api/household/${userId}/members/${memberUserId}/transactions`, {
      method: "POST",
      body: JSON.stringify(req),
    }),
  removeMember: (userId: string, memberUserId: string) =>
    apiFetch<{ removed: boolean; user_id: string }>(`/api/household/${userId}/members/${memberUserId}`, {
      method: "DELETE",
    }),

  // Tax Optimizer
  taxAnalysis: (userId: string) => apiFetch<TaxOptimizationAnalysis>(`/api/tax/${userId}/analysis`),
  calculateTax: (userId: string, req: TaxCalculationRequest) =>
    apiFetch<TaxOptimizationAnalysis>(`/api/tax/${userId}/calculate`, {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

/** Warm the response cache for the main tabs once the app is idle, so the first click on each is instant.
 * One request at a time with a short gap: firing them all at once starved the small API server of the page's own calls. */
export function prefetchCore(userId: string) {
  let stopped = false;
  const calls = [api.dashboard, api.goals, api.budgets, api.budgetStatus, api.accounts, api.notifications, api.plan, api.financialSecurity];
  const run = async () => {
    for (const f of calls) {
      if (stopped || document.hidden) return;
      await (f as (id: string) => Promise<unknown>)(userId).catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    }
  };
  const start = () => void run();
  const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(start, { timeout: 4000 }) : window.setTimeout(start, 2500);
  return () => {
    stopped = true;
    if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") window.cancelIdleCallback(idle);
  };
}
