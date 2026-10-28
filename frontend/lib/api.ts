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

// Production (Vercel multi-service project) serves the backend on the same
// origin under /api, so default to relative URLs there; local dev talks to
// the separate uvicorn server. NEXT_PUBLIC_API_URL overrides either.
// Dev uses 127.0.0.1, not "localhost": uvicorn binds IPv4 only, and clients
// that try IPv6 (::1) first wait ~2s per request before falling back.
const configured = process.env.NEXT_PUBLIC_API_URL;
const onLoopback = typeof window === "undefined" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
// A copied .env file can leave NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 on the host: from a deployed site that is the visitor's own machine ("Failed to fetch"), so use the same origin instead.
const API_URL =
  configured && !onLoopback && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(configured)
    ? ""
    : configured ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

/** Attach the Firebase ID token whenever a user is signed in. Demo-only usage
 * (no signed-in session) omits the header, which the backend already allows
 * for the demo personas. authStateReady() waits for Firebase to restore the
 * persisted session so first-load requests aren't sent anonymously. */
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { auth: firebaseAuth } = await import("./firebase/config");
    await firebaseAuth.authStateReady();
    if (firebaseAuth.currentUser) {
      const fbToken = await firebaseAuth.currentUser.getIdToken();
      if (fbToken) return { Authorization: `Bearer ${fbToken}` };
    }
  } catch {
    // Firebase auth not available or not signed in
  }
  return {};
}

// GET responses are reused for a short while, so switching tabs shows data instantly and
// identical in-flight requests share one fetch. Every write clears it, so edits never look stale.
const GET_TTL_MS = 30_000;
const getCache = new Map<string, { at: number; value: Promise<unknown> }>();
export const clearApiCache = () => getCache.clear();

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

function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && init.method !== "GET") return request<T>(path, init);
  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.value as Promise<T>;
  const value = request<T>(path, init);
  getCache.set(path, { at: Date.now(), value });
  value.catch(() => getCache.delete(path)); // never keep a failed request
  return value;
}

/** Plain server message for a 4xx (e.g. "That OTP is not correct"); the full status line for anything else. */
async function errorMessage(path: string, res: Response): Promise<string> {
  const text = await res.text();
  if (res.status < 500) {
    try {
      const detail = (JSON.parse(text) as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail) return detail;
    } catch {
      // not JSON: fall through
    }
  }
  return `API ${path} failed: ${res.status} ${text}`;
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

export const api = {
  health: () => apiFetch<{ status: string }>("/api/health"),
  /** English UI text -> Hindi/Marathi (server caches; used only for text nobody hand-translated). */
  translateTexts: (lang: string, texts: string[]) =>
    apiFetch<{ translations: Record<string, string> }>("/api/translate", { method: "POST", body: JSON.stringify({ lang, texts }) }),
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
  /** Plaid: get a Link token, then trade the public token Link returns for a one-time import. */
  plaidLinkToken: (userId: string) => apiFetch<{ link_token: string }>(`/api/plaid/${userId}/link-token`, { method: "POST" }),
  plaidImport: (userId: string, publicToken: string) =>
    apiFetch<{ accounts: number; transactions: number }>(`/api/plaid/${userId}/import`, { method: "POST", body: JSON.stringify({ public_token: publicToken }) }),
  connectConnector: (userId: string, connector: string, profile: ConnectProfile, url = "") =>
    apiFetch<{ connected: boolean; accounts: number; transactions: number }>(
      `/api/connectors/${userId}/${connector}/connect`,
      { method: "POST", body: JSON.stringify({ profile, url }) }
    ),
  /** Re-reads the linked Google Sheet. Only announces a data change when the sheet actually changed. */
  syncSheet: async (userId: string): Promise<boolean> => {
    const res = await fetch(`${API_URL}/api/connectors/${userId}/google_sheets/sync`, { method: "POST", headers: await authHeader() });
    clearApiCache();
    if (!res.ok) throw new Error(`Sheet sync failed: ${res.status}`);
    const { changed } = (await res.json()) as { changed: boolean };
    if (changed) notifyIfWrite("POST");
    return changed;
  },
  /** Downloads a connected source's dataset as a CSV file. */
  exportConnector: async (userId: string, connector: string) => {
    const res = await fetch(`${API_URL}/api/connectors/${userId}/${connector}/export`, { headers: await authHeader() });
    if (!res.ok) throw new Error(`Export failed: ${res.status} ${await res.text()}`);
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
    apiFetch<{ caught: boolean; findings: SecurityFinding[] }>(`/api/security/${userId}/simulate-fraud`, { method: "POST", body: JSON.stringify({ merchant, amount }) }),
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
    if (!res.ok) throw new Error(`API upload failed: ${res.status} ${await res.text()}`);
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
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return res.json();
  },
  // Statement / passbook photo -> OCR -> personal data removed -> preview; nothing is saved until importOcr
  extractStatement: async (userId: string, file: File): Promise<OcrPreview> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/api/ocr/extract/${userId}`, { method: "POST", headers: await authHeader(), body });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Upload failed: ${res.status}`);
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
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Could not save: ${res.status}`);
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
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Could not save: ${res.status}`);
    return res.json() as Promise<{ item: string; price: number }>;
  },
  snapPhoto: async (userId: string, photo: File): Promise<SnapResult> => {
    const body = new FormData();
    body.append("photo", photo);
    const res = await fetch(`${API_URL}/api/expenses/${userId}/snap`, { method: "POST", headers: await authHeader(), body });
    clearApiCache();
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Could not read that photo: ${res.status}`);
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

/** Warm the response cache for the main tabs once the app is idle, so the first click on each is instant. */
export function prefetchCore(userId: string) {
  const run = () =>
    [api.dashboard, api.goals, api.budgets, api.budgetStatus, api.accounts, api.notifications, api.plan, api.financialSecurity]
      .forEach((f) => (f as (id: string) => Promise<unknown>)(userId).catch(() => {}));
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
