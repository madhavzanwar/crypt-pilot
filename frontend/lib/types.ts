/**
 * TypeScript mirror of backend/app/schemas.py. Hand-written for Phase 0 so
 * the frontend can build against a stable contract immediately; superseded
 * by generated types (openapi-typescript against the live FastAPI schema)
 * once the backend stabilizes -- keep shapes identical in the meantime.
 */

export type AccountType = "checking" | "savings" | "credit_card" | "loan" | "investment";

export type TxnCategory =
  | "income"
  | "rent_housing"
  | "emi_loan"
  | "groceries"
  | "dining"
  | "transport"
  | "utilities"
  | "subscriptions"
  | "shopping"
  | "healthcare"
  | "entertainment"
  | "investment_sip"
  | "credit_card_payment"
  | "transfer"
  | "education"
  | "fees_interest"
  | "other";

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | "irregular";

export type ActionType =
  | "cancel_subscription"
  | "reduce_category_spend"
  | "prepay_debt"
  | "increase_sip"
  | "build_emergency_fund"
  | "refinance_debt"
  | "affordability_check"
  | "shift_payment_date";

export interface SubScore {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthScore {
  overall: number;
  sub_scores: SubScore[];
  computed_at: string;
  trend_30d: number | null;
}

export interface ForecastPoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
  is_gap_risk: boolean;
}

export interface CashFlowForecast {
  generated_at: string;
  horizon_days: number;
  points: ForecastPoint[];
  first_gap_date: string | null;
  confidence: number;
  basis: string;
}

export interface Fact {
  text: string;
  value: number | null;
  source_txn_ids: string[];
}

export interface Prediction {
  text: string;
  value: number | null;
  range_low: number | null;
  range_high: number | null;
  confidence: number;
  basis: string;
}

export interface ImpactEstimate {
  metric: string;
  before: number;
  after: number;
  delta: number;
  horizon: string;
}

export interface Recommendation {
  action: ActionType;
  text: string;
  rationale: string;
  impact: ImpactEstimate;
  confidence: number;
  action_params: Record<string, unknown>;
}

export interface DataGap {
  text: string;
  what_would_help: string;
}

export interface NextStep {
  title: string;
  why: string;
  when?: string | null;
  link?: string | null;
}

export interface SourceLink {
  title: string;
  url: string;
}

export interface DocumentInfo {
  id: string;
  name: string;
  chars: number;
  created_at: string;
}

export interface AnswerContract {
  query: string | null;
  next_steps?: NextStep[];
  sources?: SourceLink[];
  facts: Fact[];
  predictions: Prediction[];
  recommendations: Recommendation[];
  data_gaps: DataGap[];
  narrative: string;
  nugen_narrative?: string | null;
  nugen_confidence?: number | null;
  source?: string | null;
}

export type ChatEngine = "auto" | "deep" | "fast";

export interface SchemesFeed {
  today: string;
  note: string;
  nudges: string[];
  deadlines: { id: string; name: string; what: string; date: string; days_left: number; link: string }[];
  always_open: { name: string; what: string; link: string }[];
}

export interface RecurringObligation {
  group_id: string;
  merchant: string;
  category: TxnCategory;
  amount: number;
  frequency: RecurrenceFrequency;
  next_expected_date: string;
  confidence: number;
}

export interface Debt {
  id: string;
  user_id: string;
  account_id: string;
  principal: number;
  interest_rate_apr: number;
  minimum_payment: number;
  due_day_of_month: number;
}

export interface DashboardSnapshot {
  user_id: string;
  health_score: HealthScore;
  net_worth: number;
  monthly_income: number;
  monthly_expenses: number;
  savings_rate: number;
  recurring_obligations: RecurringObligation[];
  debts: Debt[];
  forecast: CashFlowForecast;
  insights: AnswerContract;
  generated_at: string;
  /** false = a real user with no accounts yet; the snapshot is an all-zero placeholder. */
  has_data: boolean;
}

export interface CopilotInsight {
  id: string;
  created_at: string;
  txn_id: string | null;
  severity: "info" | "positive" | "warning" | "critical";
  title: string;
  body: string;
  action: { label: string; href: string } | null;
}

export interface RecomputeDiff {
  insights?: CopilotInsight[];
  trigger: string;
  health_score_before: number;
  health_score_after: number;
  forecast_first_gap_before: string | null;
  forecast_first_gap_after: string | null;
  new_recommendations: Recommendation[];
  removed_recommendation_actions: ActionType[];
  narrative: string;
}

export interface SimulationRequest {
  action: ActionType;
  action_params: Record<string, unknown>;
}

export interface SimulationResult {
  request: SimulationRequest;
  health_score_before: number;
  health_score_after: number;
  forecast_before: CashFlowForecast;
  forecast_after: CashFlowForecast;
  impact: ImpactEstimate;
  confidence: number;
}

/**
 * Types below mirror the transactions/budgets/goals/net-worth/notifications
 * routers being built by sibling agents in parallel -- not live yet at the
 * time of writing, but shapes are fixed by the shared spec. Additive only.
 */

export type ReviewStatus = "pending" | "reviewed" | "skipped";
export type RuleMatchType = "contains" | "exact" | "starts_with" | "regex";
export type ReviewAction = "confirm" | "recategorize" | "skip";

export interface Transaction {
  id: string;
  user_id: string;
  date: string;
  merchant: string;
  category: TxnCategory;
  amount: number;
  account_id: string;
  description?: string | null;
  tags?: string[];
  notes?: string | null;
  review_status?: ReviewStatus;
  reviewed_at?: string | null;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface TransactionFilters {
  category?: TxnCategory;
  merchant?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  review_status?: string;
  tag?: string;
  page?: number;
  page_size?: number;
}

export interface TransactionUpdate {
  category?: TxnCategory;
  merchant?: string;
  tags?: string[];
  notes?: string;
  review_status?: ReviewStatus;
}

export interface ReviewQueueResponse {
  pending_count: number;
  items: Transaction[];
}

export interface ReviewTransactionRequest {
  action: ReviewAction;
  category?: TxnCategory;
  tags?: string[];
  notes?: string;
  create_rule?: boolean;
  rule_pattern?: string;
}

export interface CategorizationRule {
  id: string;
  user_id: string;
  match_type: RuleMatchType;
  pattern: string;
  category: TxnCategory;
  tags: string[];
  created_at: string;
}

export interface CategorizationRuleCreate {
  match_type?: RuleMatchType;
  pattern: string;
  category: TxnCategory;
  tags?: string[];
  apply_to_existing?: boolean;
}

export interface CategorizationRuleList {
  items: CategorizationRule[];
  total: number;
}

export interface Budget {
  id: string;
  user_id: string;
  category: TxnCategory;
  monthly_limit: number;
  rollover_enabled?: boolean;
  rollover_cap?: number | null;
}

export interface CreateBudgetRequest {
  category: TxnCategory;
  monthly_limit: number;
  rollover_enabled?: boolean;
  rollover_cap?: number | null;
}

export interface UpdateBudgetRequest {
  monthly_limit?: number;
  rollover_enabled?: boolean;
  rollover_cap?: number | null;
}

export type BudgetHealth = "under" | "near" | "over";

export interface BudgetStatus {
  category: TxnCategory;
  monthly_limit: number;
  spent_so_far: number;
  remaining: number;
  percent_used: number;
  status: BudgetHealth;
  rollover_amount?: number;
  total_available?: number;
  rollover_enabled?: boolean;
  rollover_cap?: number | null;
}

export interface SafeToSpend {
  amount: number;
  /** Backend verdict (e.g. "ok" | "low" | "none"). Optional for older servers; the page falls back to the amount. */
  status?: string;
  amount_note?: string | null;
  basis: string;
  as_of_date: string;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
  cover_key?: string;
  funding_account_id?: string | null;
  auto_track?: boolean;
}

export interface GoalProgress {
  goal: Goal;
  monthly_contribution: number;
  projected_completion_date: string | null;
  on_track: boolean;
  months_remaining: number | null;
  required_monthly?: number;
}

export interface CreateGoalRequest {
  name: string;
  target_amount: number;
  target_date?: string | null;
  current_amount?: number;
  cover_key?: string;
  funding_account_id?: string | null;
  auto_track?: boolean;
}

export interface UpdateGoalRequest {
  name?: string;
  current_amount?: number;
  target_date?: string | null;
  target_amount?: number;
  cover_key?: string;
  funding_account_id?: string | null;
  auto_track?: boolean;
}

export interface NetWorthPoint {
  date: string;
  net_worth: number;
}

export interface NetWorthHistory {
  points: NetWorthPoint[];
  current: number;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  balance: number;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  balance: number;
  credit_limit: number | null;
  interest_rate_apr: number | null;
  currency: string;
}

export type NotificationType = "anomaly" | "recommendation" | "upcoming_bill" | "cash_flow_gap";
export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  text: string;
  date: string;
  source_ref: string | null;
}

// ---------------------------------------------------------------------------
// Indian Income Tax Regime & Deductions Optimizer
// ---------------------------------------------------------------------------

export interface TaxSlabBreakdown {
  slab_label: string;
  rate_pct: number;
  taxable_amount_in_slab: number;
  tax_amount: number;
}

export interface TaxDeductionsBreakdown {
  standard_deduction: number;
  section_80c: number;
  section_80c_limit: number;
  section_80d: number;
  section_80d_limit: number;
  section_80ccd_1b_nps: number;
  section_80ccd_1b_limit: number;
  section_24b_home_loan_interest: number;
  section_24b_limit: number;
  hra_exemption: number;
  other_deductions: number;
  total_deductions: number;
}

export interface TaxRegimeCalculation {
  regime: "new" | "old";
  gross_income: number;
  total_deductions: number;
  taxable_income: number;
  slabs: TaxSlabBreakdown[];
  tax_before_rebate: number;
  rebate_87a: number;
  tax_after_rebate: number;
  cess_4pct: number;
  net_tax_payable: number;
  effective_tax_rate_pct: number;
  monthly_take_home: number;
  deductions_applied: TaxDeductionsBreakdown;
}

export interface DetectedDeductions {
  section_80c_detected: number;
  section_80d_detected: number;
  home_loan_interest_detected: number;
  rent_paid_detected: number;
}

export interface TaxOptimizationAnalysis {
  user_id: string;
  gross_annual_income: number;
  new_regime: TaxRegimeCalculation;
  old_regime: TaxRegimeCalculation;
  recommended_regime: "new" | "old";
  annual_tax_savings: number;
  monthly_take_home_delta: number;
  recommendation_rationale: string;
  break_even_deductions_needed: number;
  detected_deductions: DetectedDeductions;
}

export interface TaxCalculationRequest {
  gross_annual_income?: number | null;
  section_80c?: number | null;
  section_80d?: number | null;
  section_80ccd_1b_nps?: number | null;
  section_24b_home_loan?: number | null;
  hra_exemption?: number | null;
  other_deductions?: number | null;
}

// ---------------------------------------------------------------------------
// Household & Collaboration (Pillar 5D)
// ---------------------------------------------------------------------------

export type HouseholdRole = "owner" | "editor" | "viewer";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Household {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  display_name?: string;
  avatar_letter?: string;
  net_worth?: number;
  is_managed?: boolean;
  relationship?: string | null;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  invited_email: string;
  role: HouseholdRole;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
  invite_link?: string;
  token?: string;
}

export interface CreateHouseholdRequest {
  name: string;
}

export interface CreateInviteRequest {
  email: string;
  role?: HouseholdRole;
}

export interface AcceptInviteRequest {
  token: string;
}

export interface MemberWealthContribution {
  user_id: string;
  display_name: string;
  role: string;
  assets: number;
  liabilities: number;
  net_worth: number;
  pct_of_household: number;
}

export interface HouseholdNetWorthSummary {
  total_net_worth: number;
  total_assets: number;
  total_liabilities: number;
  members_breakdown: MemberWealthContribution[];
}

export interface SpendTxn { id: string; date: string; merchant: string; category: string; amount: number }
export interface MemberSpending {
  user_id: string;
  display_name: string;
  avatar_letter: string;
  relation: string | null;
  role: HouseholdRole;
  total_spend: number;
  previous_spend: number;
  change_pct: number | null;
  share_pct: number;
  txn_count: number;
  monthly_income: number;
  by_category: { category: string; amount: number }[];
  top_merchants: { merchant: string; amount: number }[];
  recent: SpendTxn[];
  monthly_trend: { month: string; amount: number }[];
}
export interface HouseholdSpending {
  household_id: string;
  household_name: string;
  days: number;
  viewer_user_id: string;
  viewer_role: HouseholdRole;
  can_view_all: boolean;
  total_spend: number;
  members: MemberSpending[];
}

export interface AddManagedMemberRequest {
  name: string;
  relationship?: string;
  opening_balance?: number;
}

export interface AddManagedTransactionRequest {
  merchant: string;
  amount: number; // positive = in, negative = out
  category?: string;
  date?: string;
  description?: string;
}

export interface MemberLedger {
  member: HouseholdMember;
  balance: number;
  total_in: number;
  total_out: number;
  transactions: Transaction[];
}

export interface HouseholdInsights {
  months: { month: string; by_member: Record<string, number>; total: number }[];
  categories: { category: string; total: number; by_member: Record<string, number> }[];
  cashflow: { user_id: string; display_name: string; income: number; spend: number; savings_rate: number }[];
  window_label: string;
}

export interface HouseholdSummary {
  household: Household;
  members: HouseholdMember[];
  invites: HouseholdInvite[];
  net_worth_summary: HouseholdNetWorthSummary;
  user_role: HouseholdRole;
}



// --- Financial plan (constrained planner + probabilistic monthly forecast) ---
export interface PlanQuantiles { p10: number; p50: number; p90: number }
export interface ForecastMethod {
  name: string;
  horizon_months: number;
  n_paths: number;
  seed: number;
  window_months: number;
  pi_level: number;
  description: string;
}
export interface PeriodForecast {
  period: number;
  month: string;
  income: PlanQuantiles;
  essential: PlanQuantiles;
  discretionary: PlanQuantiles;
  debt_min: number;
  net: PlanQuantiles;
}
export interface PlanGoal { kind: string; amount: number; by_period: number }
export interface PlanConstraints {
  min_reserve: number;
  max_discretionary_cut: number;
  goal: PlanGoal | null;
  risk_tolerance: number;
}
export interface PeriodPlan {
  period: number;
  month: string;
  income: number;
  essential: number;
  discretionary: number;
  discretionary_cut: number;
  debt_min: number;
  extra_debt: number;
  savings_contrib: number;
  cash_end: number;
  cash_p10: number;
  cash_p50: number;
  cash_p90: number;
  debt_balance: number;
  reserve_ok: boolean;
}
export interface SequenceResult {
  id: string;
  label: string;
  description: string;
  periods: PeriodPlan[];
  shortfall_risk: number;
  p_negative: number;
  goal_met_p50: boolean;
  goal_progress: number;
  interest_saved: number;
  objective: number;
}
export interface PlanConflict { constraint: string; required: number; available: number; message: string }
export interface PlanRelaxation {
  kind: string;
  from_value: number;
  to_value: number;
  message: string;
  feasible: boolean;
}
export interface PlanResult {
  method: ForecastMethod;
  constraints: PlanConstraints;
  starting_cash: number;
  forecast: PeriodForecast[];
  sequences: SequenceResult[];
  feasible: boolean;
  conflicts: PlanConflict[];
  relaxations: PlanRelaxation[];
  recommended_id: string | null;
  p50_only_best_id: string | null;
  uncertainty_changed_choice: boolean;
  rationale: string;
  risk_adjusted: SequenceResult | null;
}
export interface PlanShock {
  kind: "income_change" | "essential_expense";
  from_period: number;
  pct?: number;
  amount?: number;
}
export interface ReplanResult {
  shock: PlanShock;
  before: PlanResult;
  after: PlanResult;
  changed_periods: number[];
}
export interface PlanParams {
  reserve?: number;
  goal_amount?: number;
  goal_month?: number;
  tolerance?: number;
  cut?: number;
  horizon?: number;
}
export interface BacktestRow {
  model: "bootstrap" | "hist_avg" | "recurring";
  stream: string;
  mae: number;
  coverage: number;
  mean_width: number;
}
export interface PlanTimeline {
  train: [number, number];
  validation: [number, number];
  test: [number, number];
  chosen_window: number;
}
export interface PlanOutcomeRow {
  period: number;
  planned_cash: number;
  realized_cash: number;
  reserve_breached: boolean;
}
export interface PlanScenario {
  name: string;
  title: string;
  assumptions: Record<string, unknown>;
  timeline: PlanTimeline;
  plan: PlanResult;
  replan?: ReplanResult;
  outcome: PlanOutcomeRow[];
  backtest: BacktestRow[];
}
export interface PlanScenarioSummary { name: string; title: string }

export interface Connector {
  id: string;
  name: string;
  description: string;
  /** false = listed but not live yet ("coming soon"). */
  available: boolean;
  connected: boolean;
  detail: string | null;
  connected_at: string | null;
}

export type ConnectProfile = "priya" | "arjun" | "meera";

// Security suite
export type ProfileLevel = "basic" | "standard" | "deep";
export interface ProfileQuestion { id: string; label: string; type: "text" | "number" | "choice"; options: string[]; hint: string; when?: { id: string; equals: string } | null }
export interface Profile { completed: boolean; level: ProfileLevel | "skipped" | null; answers: Record<string, string> }

export interface FinancialSecurity {
  generated_at: string;
  score: number;
  grade: string;
  risk_level: "low" | "medium" | "high";
  transactions_checked: number;
  flagged_transactions: number;
  amount_at_risk: number;
  findings_total: number;
  severity_counts: Record<"high" | "medium" | "low", number>;
  pillars: { key: string; label: string; hint: string; findings: number; amount_at_risk: number; score: number }[];
  accounts: { name: string; type: string; balance: number; transactions: number; flagged: number; flagged_amount: number }[];
  top_findings: Pick<SecurityFinding, "agent" | "severity" | "title" | "detail" | "merchant" | "amount">[];
}

export interface FinancialSecurityBrief {
  headline: string;
  summary: string;
  risks: string[];
  actions: string[];
  source: "finpilot" | "rules";
}

export interface SchemeAnalysis {
  scheme: string;
  brief: { summary: string; eligibility: string[]; benefits: string[]; how_to_apply: string[]; deadlines: string[]; watch_out: string[] } | null;
  answer: string | null;
  sources: { n: number; title: string; url: string }[];
  note?: string;
}
export interface SecurityFinding {
  agent: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  merchant: string | null;
  amount: number;
  txn_ids: string[];
  corroborated_by?: string[];
  web?: { answer: string; url: string };
  ai?: { model: string; verdict: "confirm" | "doubt"; note: string };
}
export interface AgentSummary { agent: string; name: string; findings: number; ms: number; score?: number; source?: string | null; error?: string | null; model?: string; ai?: "ok" | "error" | "off"; backup?: boolean }
export interface SecurityReport {
  created_at: string;
  risk_score: number;
  risk_level: "high" | "medium" | "low";
  transactions_checked: number;
  agents: AgentSummary[];
  findings: SecurityFinding[];
  verdict: { headline: string; what_is_wrong: string; what_to_do: string[] } | null;
  verdict_source: string | null;
  verdict_error: string | null;
  demo_threats_present: boolean;
}
export type SecurityEvent =
  | ({ type: "agent"; agent: string; status: "running" | "done" } & Partial<AgentSummary>)
  | { type: "report"; report: SecurityReport };
export interface GraphNode { id: string; label: string; kind: "you" | "account" | "category" | "merchant"; amount: number; flagged: boolean; findings: string[] }
export interface GraphEdge { source: string; target: string; amount: number; flagged: boolean }
export interface SecurityGraph {
  months: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: { flagged_merchants: number; money_at_risk: number; total_spend: number };
}
export interface DataSource { id: string; name: string; detail: string | null; records: number; preview: unknown[]; disconnectable: boolean }
export interface AccessEntry { when: string; event: string; method: string; path: string; detail: string; status: number }
export interface MyData { sources: DataSource[]; access_log: AccessEntry[] }

export interface OcrTxn { date: string; description: string; amount: number }
export interface OcrPreview { transactions: OcrTxn[]; removed: Record<string, number> }

export interface TaughtItem { item: string; price: number; category: string; has_photo: boolean }
export interface PhotoSuggestion { item: string | null; price: number | null; category: string; source: string }
export type SnapResult =
  | { added: true; id: string; item: string; amount: number; category: string }
  | { added: false; suggestion: PhotoSuggestion };

export type CouncilVote = { agent: string; name: string; score: number; level: string; why: string; do: string; source: "model" | "rules"; round: number };
export type CouncilVerdict = {
  type: "verdict"; cached: boolean; score: number; level: string; counts: Record<string, number>; votes: CouncilVote[];
  dissent: { agent: string; name: string; level: string; why: string }[]; actions: string[]; anchor: number; tokens: number; debated: boolean;
};
export type CouncilEvent =
  | { type: "facts"; facts: Record<string, unknown>; approx_tokens: number }
  | { type: "vote"; vote: CouncilVote }
  | { type: "debate"; median: number; agents: string[] }
  | CouncilVerdict;

export interface OpsStats { name: string; calls: number; errors: number; avg_ms: number; success: number; tokens: number; last_ok?: boolean; last_ts?: string; last_error?: string | null }
export interface OpsEvent {
  kind: "call" | "fallback" | "cache" | "search" | "run" | "split" | "stage" | "index" | "outage" | "recovery";
  ts: string; agent?: string; run?: string; provider?: string; key?: string; model?: string; to?: string; reason?: string;
  ok?: boolean; ms?: number; tokens?: number; error?: string | null; op?: string; query?: string; sites?: string[]; results?: number;
  parts?: number; detail?: string; step?: string; findings?: number; state?: string; chunks?: number;
}
export interface OpsRun {
  run: string; ts: string; via: string | null; parts: number | null; calls: number; errors: number; fallbacks: number; cache_hits: number; tokens: number; ms: number;
  stages: { agent: string; step: string; ms: number; findings: number | null }[];
}
export interface OpsResilience {
  providers: { provider: string; up: boolean }[];
  caches: { name: string; entries: number; note: string }[];
  index_events: OpsEvent[];
  behaviour: { layer: string; offline: string; back: string }[];
}
export interface OpsProbe { env: string; status: OpsKeyStatus; ms: number | null; detail: string }
export type OpsKeyStatus = "working" | "failing" | "unused" | "not_set" | "untestable";
export interface OpsOverview {
  keys: { env: string; provider: string; use: string; configured: boolean; masked: string | null; stats: OpsStats | null; status: OpsKeyStatus; testable: boolean }[];
  agents: { agent: string; task: string; model: string | null; backup: string | null; stats: OpsStats | null }[];
  models: OpsStats[];
  totals: { tokens: number; fallbacks: number; cache_hits: number };
  searches: OpsEvent[];
  runs: OpsRun[];
  resilience: OpsResilience;
  events: OpsEvent[];
}

// --- Forecast & Risk (probabilistic cash-flow forecast, shortfall risk, scenarios, backtest) ---
export interface FrDataSource {
  kind: "real" | "synthetic";
  label: string;
  disclosure: string;
  months_available: number;
  history_start: string | null;
  history_end: string | null;
  details: Record<string, unknown>;
}
export interface FrParams {
  horizon: number;
  sims: number;
  seed: number;
  reserve: number | null;
  tolerance: number;
  cut: number;
  savings: number | null;
  extra_debt: number | null;
  goal_amount: number | null;
  goal_month: number | null;
}
export interface FrPeriod {
  period: number;
  month: string;
  income: PlanQuantiles;
  expenses: PlanQuantiles;
  net: PlanQuantiles;
  cash: PlanQuantiles;
  p_below_reserve: number;
  p_negative: number;
}
export interface FrMonthRisk { period: number; month: string; p_below_reserve: number; p_negative: number; p_first_breach: number }
export interface FrRiskFactor { key: string; label: string; message: string; impact: number | null }
export interface FrRisk {
  reserve: number;
  tolerance: number;
  p_below_reserve: number;
  p_negative: number;
  level: "low" | "moderate" | "high";
  typical_breach_month: string | null;
  by_month: FrMonthRisk[];
  severity: { expected_shortfall: number; median_if_breach: number; p95_if_breach: number; p95_below_zero: number };
  factors: FrRiskFactor[];
}
export interface FrScenario {
  id: string;
  label: string;
  description: string;
  available: boolean;
  unavailable_reason: string | null;
  monthly_cut: number;
  monthly_savings: number;
  monthly_extra_debt: number;
  cash: PlanQuantiles[];
  end_cash: PlanQuantiles | null;
  shortfall_risk: number;
  p_negative: number;
  risk_delta: number;
  total_savings: number;
  total_extra_debt: number;
  spending_avoided: number;
  ending_debt: number;
  debt_change: number;
  interest_saved: number;
  net_worth_change: number;
  goal_progress: number;
  value_built: number;
  tradeoffs: string[];
}
export interface FrCalibration {
  event: string;
  n_forecasts: number;
  mean_predicted: number;
  observed_rate: number;
  brier_model: number;
  brier_hist_avg: number;
  bins: { lo: number; hi: number; mean_predicted: number; observed: number; count: number }[];
  low_sample: boolean;
}
export interface FrAccuracy {
  available: boolean;
  reason: string | null;
  n_test_months: number;
  timeline: PlanTimeline | null;
  rows: BacktestRow[];
  calibration: FrCalibration | null;
  findings: string[];
}
export interface ForecastRiskReport {
  status: "ok" | "insufficient_history";
  message: string | null;
  data_source: FrDataSource;
  params: FrParams | null;
  method: ForecastMethod | null;
  starting_cash: number;
  reserve: number;
  summary: {
    end_cash: PlanQuantiles;
    median_income: number;
    median_expenses: number;
    median_net: number;
    p_below_reserve: number;
    p_negative: number;
    risk_level: "low" | "moderate" | "high";
  } | null;
  history: { month: string; income: number; expenses: number }[];
  periods: FrPeriod[];
  risk: FrRisk | null;
  scenarios: {
    params: { cut: number; savings: number; extra_debt: number };
    outcomes: FrScenario[];
    recommendation: { scenario_id: string; label: string; within_tolerance: boolean; criteria: string; rationale: string } | null;
  } | null;
  accuracy: FrAccuracy | null;
  assumptions: string[];
  warnings: string[];
}
export interface ForecastRiskQuery {
  source?: "real" | "synthetic";
  profile?: "stable" | "moderate" | "volatile";
  synth_seed?: number;
  horizon?: number;
  sims?: number;
  seed?: number;
  reserve?: number;
  tolerance?: number;
  cut?: number;
  savings?: number;
  extra_debt?: number;
  goal_amount?: number;
  goal_month?: number;
}

export interface PayResult {
  id: string;
  status: "success";
  amount: number;
  payee_name: string;
  upi_id: string;
  category: string;
  paid_at: string;
  balance: number;
  account: string;
}

export interface PayCheck { key: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail: string }
export interface PayImpact {
  balance_before: number; balance_after: number; pct_of_balance: number;
  month_spend_before: number; month_spend_after: number; avg_month_spend: number; spend_vs_avg_pct: number | null;
  category: string; category_month_after: number; category_avg: number;
  budget_limit: number | null; budget_used_pct: number | null; runway_months: number | null;
}
export interface PayReview {
  id: string; heavy: boolean; verdict: "secure" | "review" | "suspicious"; headline: string;
  checks: PayCheck[]; impact: PayImpact; insights: string[];
}
export interface PayReviewItem {
  id: string; payee_name: string; amount: number; status: "open" | "confirmed" | "reported" | "blocked"; created_at: string; review: PayReview;
}
