# FinPilot Backend Reality Check & Pillar Audit Report

**Date:** 2026-10-03  
**Auditor:** Senior Full-Stack Engineer & Product Reviewer  
**Scope:** Verification of all 4 landing-page showcase pillars (**TRACK**, **BUDGET**, **COLLABORATE**, **PLAN**), identifying real backend functionality vs. simulated UI / hardcoded demo data.

---

## 1. Executive Summary & One-Glance Scorecard

| Pillar | Real | Partial | Mock | Missing | Plain-English Reality Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **TRACK** | **4** | **1** | **2** | **0** | **Partly backed** (Core ledger & net worth are real; tags, notes, review state, spending velocity line, and Sankey are landing-only mocks). |
| **BUDGET** | **3** | **1** | **1** | **1** | **Partly backed** (Envelopes CRUD, live spend from txns, and safe-to-spend are real; rollover and over-budget alert notifications are missing/mock). |
| **COLLABORATE** | **0** | **0** | **1** | **5** | **Not present** (Zero backend/database multi-user collaboration; only a single-user persona switcher exists; collaborative net worth is a pure UI mock). |
| **PLAN** | **4** | **1** | **1** | **1** | **Partly backed** (Goals CRUD, on-track math, and simulation linkage are real; tune target slider is mock on landing page; goal cover images are missing in DB). |

---

## 2. Pillar-by-Pillar Detailed Audit Matrix

### Pillar 1: TRACK ("Know where you stand")

| ID | Requirement | Verdict | UI `file:line` | API Route | DB Table | Concrete Evidence & Verification |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **T1** | Net worth / consolidated accounts calculation | **REAL** | [`frontend/app/(app)/dashboard/page.tsx:20`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/dashboard/page.tsx#L20) | `GET /api/networth/{user_id}/history` | `accounts`, `transactions` | Live curl returned 30 daily data points; reconstructed from `AccountRow` balance and backward sum of `TransactionRow` entries in [`backend/app/api/networth_router.py:99-130`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/networth_router.py#L99-L130). |
| **T2** | Transactions list with filter/sort/search + CSV export | **REAL** | [`frontend/app/(app)/transactions/page.tsx:100-249`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/transactions/page.tsx#L100-L249) | `GET /api/transactions/{user_id}` | `transactions` | Live curl returned 580 transactions for `demo-priya` with SQL filtering by category, search substring, and date range in [`backend/app/api/transactions_router.py:24-74`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/transactions_router.py#L24-L74). `handleExportCSV` generates client-side CSV blob. |
| **T3** | Transaction categorization edit (PATCH) & review/skip state | **PARTIAL** | [`frontend/app/(app)/transactions/page.tsx:327`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/transactions/page.tsx#L327) | `PATCH /api/transactions/{user_id}/{txn_id}` | `transactions` | Category updates persist to DB and verified live (changed DMart from `groceries` to `dining`). However, **tags**, **notes**, and **reviewed/skip state** shown in [`scenes/TrackScene.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/TrackScene.tsx) do NOT exist in `TransactionRow` schema ([`backend/app/models.py:33-47`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L33-L47)). |
| **T4** | Categorization rules engine (ingest + user rules) | **PARTIAL** | [`frontend/components/dashboard/AddDataPanel.tsx:50`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/dashboard/AddDataPanel.tsx#L50) | `POST /api/upload/{user_id}` | `transactions` | System categorizer in [`backend/app/ingest/categorize.py:28-62`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/ingest/categorize.py#L28-L62) has 16 regex categories + Gemini embedding fallback. However, **user-defined categorization rules** do not exist in the API or DB. |
| **T5** | Spending-velocity data (cumulative actual vs budget line) | **MOCK** | [`frontend/components/interactive/InteractiveLineChart.tsx:25-37`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/InteractiveLineChart.tsx#L25-L37) | None | None | Uses static hardcoded `DEFAULT_POINTS` array (`Oct 01: ₹1800 actual / ₹2500 budget`, etc.) directly inside the React component. No API endpoint exists. |
| **T6** | Cash-flow / Sankey diagram telemetry | **MOCK** | [`frontend/components/interactive/SankeyDiagram.tsx:25-66`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/SankeyDiagram.tsx#L25-L66) | None | None | Uses static hardcoded constants (`TOTAL_INCOME = 95000`, `obligations: 46700`, `discretionary: 28300`, `investments: 20000`) embedded in the component. |
| **T7** | Audit-log entry written for each mutation | **REAL** | [`frontend/app/(app)/security/page.tsx:40`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/security/page.tsx#L40) | Middleware on all mutating routes | `audit_logs` | Verified live: `audit_log_middleware` in [`backend/app/main.py:64-118`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/main.py#L64-L118) logged all test PATCH/POST mutations and 401 auth denials to `AuditLogRow`. |

---

### Pillar 2: BUDGET ("Budgeting that fits your life")

| ID | Requirement | Verdict | UI `file:line` | API Route | DB Table | Concrete Evidence & Verification |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **B1** | Budgets CRUD & category monthly limits | **REAL** | [`frontend/app/(app)/budgets/page.tsx:80-140`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/budgets/page.tsx#L80-L140) | `GET/POST/DELETE /api/budgets/{user_id}` | `budgets` | Verified live: `POST /api/budgets/demo-priya` upserted dining limit to ₹15,000 in `BudgetRow` table ([`backend/app/models.py:109-120`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L109-L120)). |
| **B2** | "Spent" per envelope computed from real transactions | **REAL** | [`frontend/app/(app)/budgets/page.tsx:160`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/budgets/page.tsx#L160) | `GET /api/budgets/{user_id}/status` | `budgets`, `transactions` | `_spent_this_month` in [`backend/app/api/budgets_router.py:93-107`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/budgets_router.py#L93-L107) queries live `TransactionRow` table for current calendar month and calculates spend dynamically. |
| **B3** | Envelope rollover (+₹50 / -₹40 balance carryover) | **MISSING** | [`frontend/components/interactive/InteractiveBentoGrid.tsx:91-96`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/InteractiveBentoGrid.tsx#L91-L96) | None | None | No rollover calculation, historical carryover table, or cumulative envelope ledger exists in the backend. The landing page bento shows static mock text. |
| **B4** | Burn-pace / safe-to-spend calculation | **REAL** | [`frontend/app/(app)/budgets/page.tsx:65`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/budgets/page.tsx#L65) | `GET /api/budgets/{user_id}/safe-to-spend` | `transactions` | Verified live: [`backend/app/api/budgets_router.py:182-258`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/budgets_router.py#L182-L258) evaluates `(monthly_income - committed_recurring - discretionary_spent) / days_remaining`. |
| **B5** | Over-budget alert generation feeding NotificationBell | **PARTIAL** | [`frontend/components/NotificationBell.tsx:23`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/NotificationBell.tsx#L23) | `GET /api/notifications/{user_id}` | `transactions` | NotificationBell is real and fetches live feed, but [`backend/app/api/notifications_router.py:58-147`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/notifications_router.py#L58-L147) only checks anomalies, recommendations, upcoming bills, and cash gaps — it lacks budget limit threshold triggers. |
| **B6** | Budget changes feed "Category budget tightening" simulation | **PARTIAL** | [`frontend/app/(app)/simulate/page.tsx:90`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/simulate/page.tsx#L90) | `POST /api/simulate/{user_id}` | None | Simulation engine supports `reduce_category_spend` ([`backend/app/simulate/engine.py:465-492`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/simulate/engine.py#L465-L492)), but takes interactive user parameters rather than automatically reading `BudgetRow` limits. |

---

### Pillar 3: COLLABORATE ("Make smart money moves together")

| ID | Requirement | Verdict | UI `file:line` | API Route | DB Table | Concrete Evidence & Verification |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **C1** | Household / workspace / members tables | **MISSING** | None | None | None | Verified table inventory via SQLModel metadata: `['accounts', 'transactions', 'debts', 'incomes', 'goals', 'events', 'insights_snapshots', 'budgets', 'audit_logs']`. Zero multi-tenant tables. |
| **C2** | Invite flow (create invite, email via Resend, accept) | **MISSING** | None | None | None | No invite router, token generator, or collaboration email templates exist in backend or Supabase migrations. |
| **C3** | Roles & permissions in backend AND RLS | **MISSING** | None | None | None | RLS policies in [`supabase/migrations/0001_init.sql:99-102`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/supabase/migrations/0001_init.sql#L99-L102) strictly enforce single-user `auth.uid() = user_id`. |
| **C4** | Shared net worth across members' accounts | **MOCK** | [`frontend/components/showcase/scenes/CollaborateScene.tsx:20-90`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/CollaborateScene.tsx#L20-L90) | None | None | Pure UI simulation on landing page (`Jessie & Dylan`, Net Worth `$568,356.49`, Joint Checking) hardcoded in `showcaseData.ts`. |
| **C5** | Shared budgets / goals with attribution | **MISSING** | None | None | None | Budgets and goals only support a single `user_id` foreign key. |
| **C6** | Per-account privacy flag | **MISSING** | None | None | None | `AccountRow` ([`backend/app/models.py:19-31`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L19-L31)) has no `is_private` or `is_shared` column. |

> [!NOTE]
> **Collaboration Summary:** Beyond the top-bar demo persona switcher (`demo-priya`, `demo-arjun`, `demo-meera`), **no multi-user collaboration feature exists in the codebase**.

---

### Pillar 4: PLAN ("Set goals (and crush them)")

| ID | Requirement | Verdict | UI `file:line` | API Route | DB Table | Concrete Evidence & Verification |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **P1** | Goals table + CRUD endpoints | **REAL** | [`frontend/app/(app)/goals/page.tsx:60-150`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx#L60-L150) | `GET/POST/PATCH/DELETE /api/goals/{user_id}` | `goals` | Verified live: Created and updated goal `Emergency Fund` (target ₹300,000, current ₹150,000) in `GoalRow` table ([`backend/app/models.py:72-81`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L72-L81)). |
| **P2** | Progress computed from linked accounts/SIP contributions | **PARTIAL** | [`frontend/app/(app)/goals/page.tsx:180`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx#L180) | `GET /api/goals/{user_id}` | `goals`, `transactions` | Real `/goals` app page computes dynamic monthly savings contribution from trailing 3-month transactions (`_estimated_monthly_contribution`). However, landing page [`GoalsCards.tsx:20-61`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/GoalsCards.tsx#L20-L61) has hardcoded values (₹3,84,000 of ₹4,80,000). |
| **P3** | Milestone ticks (25/50/75/100%) derived from data | **REAL** | [`frontend/app/(app)/goals/page.tsx:210`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx#L210) | `GET /api/goals/{user_id}` | `goals` | Derived dynamically in UI from `(current_amount / target_amount) * 100`. |
| **P4** | "Tune Targets" slider persistence | **MOCK** (Landing) / **REAL** (App) | [`frontend/components/interactive/GoalsCards.tsx:83-87`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/GoalsCards.tsx#L83-L87) vs [`frontend/app/(app)/goals/page.tsx:130`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx#L130) | `PATCH /api/goals/{user_id}/{goal_id}` | `goals` | On the landing page, `handleTargetChange` only modifies local React state (`setGoals`). In the real app, target edits call `api.updateGoal` and persist to DB. |
| **P5** | Required monthly contribution / on-track calculation | **REAL** | [`frontend/app/(app)/goals/page.tsx:220`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx#L220) | `GET /api/goals/{user_id}` | `goals`, `transactions` | Computed live by [`backend/app/analytics/goals.py:project_goal`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/analytics/goals.py) comparing projected completion date with target date. |
| **P6** | Connected to What-If simulator & health score | **REAL** | [`frontend/app/(app)/simulate/page.tsx:75`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/simulate/page.tsx#L75) | `POST /api/simulate/{user_id}` | None | `ActionType.build_emergency_fund` in [`backend/app/simulate/engine.py:353-388`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/simulate/engine.py#L353-L388) models emergency fund trajectory, and `compute_emergency_fund_score` feeds the health score. |
| **P7** | Goal cover image / icon storage | **MISSING** | [`frontend/components/showcase/scenes/PlanScene.tsx:15-35`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/PlanScene.tsx#L15-L35) | None | None | `GoalRow` table has no `image_url` or `icon` column; images in showcase are static Unsplash URLs. |

---

## 3. Comprehensive Inventory of Landing Page Hardcoded Data

| Landing Page Component / Section | Hardcoded Values / Arrays | Where Data Must Come From to Make Real |
| :--- | :--- | :--- |
| **Showcase TRACK Scene** ([`scenes/TrackScene.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/TrackScene.tsx)) | `TRACK_TRANSACTIONS` in `showcaseData.ts` (Apex Cloud $19.99, Urban Market $54.29, Horizon $1,200) | `GET /api/transactions/{user_id}?page_size=3` |
| **Showcase BUDGET Scene** ([`scenes/BudgetScene.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/BudgetScene.tsx)) | `BUDGET_ITEMS` in `showcaseData.ts` (Grocery $145.89/$600, Dining $30.60/$300, Shopping $267.99/$300, Fitness $44.50/$50) | `GET /api/budgets/{user_id}/status` |
| **Showcase COLLABORATE Scene** ([`scenes/CollaborateScene.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/CollaborateScene.tsx)) | `COLLABORATE_DATA` in `showcaseData.ts` (Jessie & Dylan, Net Worth $568,356.49, Joint Checking $24,850.12) | Requires creating Household & Workspace backend APIs |
| **Showcase PLAN Scene** ([`scenes/PlanScene.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/showcase/scenes/PlanScene.tsx)) | `PLAN_GOALS` in `showcaseData.ts` (Emergency Fund $30,294.09/$40k, Vacation $6,589.69/$10k, Car $4,231.33/$5k) | `GET /api/goals/{user_id}` |
| **Floating Overlap Card** ([`FloatingOverlapCard.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/FloatingOverlapCard.tsx)) | `DEFAULT_ITEMS` (Dining budget ₹2,450, Amazon 8 orders, Balance alert ₹32,400) | `GET /api/budgets/{user_id}/status` + `GET /api/notifications/{user_id}` |
| **Interactive Line Chart** ([`InteractiveLineChart.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/InteractiveLineChart.tsx)) | `DEFAULT_POINTS` (30-day cumulative spend: Day 1 ₹1800 to Day 30 ₹51,200) | New endpoint: `GET /api/analytics/{user_id}/spending-velocity` |
| **Sankey Diagram** ([`SankeyDiagram.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/SankeyDiagram.tsx)) | `TOTAL_INCOME = 95000`, obligations ₹46,700, living ₹28,300, investments ₹20,000 | `GET /api/dashboard/{user_id}` (`monthly_income`, `recurring_obligations`, `debts`) |
| **Goals Cards** ([`GoalsCards.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/GoalsCards.tsx)) | `DEFAULT_GOALS` (Emergency Runway ₹3,84,000 / ₹4,80,000, Car Loan ₹1,75,000 / ₹2,50,000) | `GET /api/goals/{user_id}` |
| **Interactive Bento Grid** ([`InteractiveBentoGrid.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/interactive/InteractiveBentoGrid.tsx)) | `SAMPLE_TRANSACTIONS`, `BUDGET_CATEGORIES`, `autopilotRules` | `GET /api/transactions/{user_id}`, `GET /api/budgets/{user_id}/status` |

---

## 4. Production Database Analysis & Persistence Impact

### Current Configuration
- **Settings Definition** ([`backend/app/core/config.py:31-34`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/core/config.py#L31-L34)):
  ```python
  database_url: str = os.getenv(
      "DATABASE_URL",
      "sqlite:////tmp/finpilot.db" if os.getenv("VERCEL") else "sqlite:///./finpilot_dev.db",
  )
  ```
- **Local Development**: Uses local SQLite file `./finpilot_dev.db` (changes persist between server restarts).
- **Vercel Serverless Production**: Defaults to ephemeral `/tmp/finpilot.db` on cold starts unless `DATABASE_URL` is configured to an external Supabase Postgres database.

### What This Means for Pillar Persistence:
1. **With Ephemeral SQLite (Default Vercel deployment without Postgres string):**
   - Every cold start wipes user mutations (budgets created, goals added, transactions re-categorized) and re-seeds the default demo personas (`seed_if_empty()` in `lifespan`).
2. **With Supabase Postgres (`DATABASE_URL` pointing to Supabase):**
   - Tables match `models.py` schema (`accounts`, `transactions`, `debts`, `incomes`, `goals`, `events`, `insights_snapshots`, `budgets`, `audit_logs`).
   - All mutations in TRACK, BUDGET, and PLAN persist permanently.

---

## 5. Risks & User-Facing Discrepancies

1. **Collaboration Misrepresentation (High Risk):**
   - The landing page showcase prominently features **COLLABORATE** ("Invite your partner to see your full picture, budget together, and reach your goals faster").
   - **Reality:** No household/workspace tables, no invite flow, and no multi-user RLS policies exist in the codebase. Users signing up expecting shared partner accounts will find zero collaboration features.
2. **Landing Page vs. Real App Number Discrepancies:**
   - Landing page Sankey shows ₹95,000 income with ₹46,700 fixed obligations, while Priya's real API returns ₹93,768 income and ₹98,000 recurring obligations (safe-to-spend = ₹0).
3. **Rollover Budgeting Claim:**
   - Landing page bento claims "Envelope Rollover Status (+₹50 / -₹40 carryover)", but the budget engine computes only isolated calendar month spending.

---

## 6. Actionable Fix Plan (Smallest Changes to Make Features Real)

### Step 1: Low-Hanging Enhancements (Effort: S | Priority: High)
1. **Wire Landing Page Components to Live Persona Data:**
   - Pass `useUserId()` to `GoalsCards.tsx`, `SankeyDiagram.tsx`, `InteractiveLineChart.tsx`, and `FeatureShowcase.tsx`.
   - Files to touch: `frontend/components/interactive/*`, `frontend/components/showcase/*`.
2. **Add Over-Budget Notification Triggers:**
   - In [`backend/app/api/notifications_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/notifications_router.py), query `BudgetRow` and trigger a `warning` notification whenever `spent_this_month > monthly_limit`.

### Step 2: Schema & Feature Additions (Effort: M | Priority: Medium)
1. **Transaction Tags, Notes & Review State:**
   - Add `tags: str` (comma-separated or JSON), `notes: str`, and `is_reviewed: bool` to `TransactionRow` in [`backend/app/models.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py) and `supabase/migrations/0004_transaction_metadata.sql`.
   - Update `PATCH /api/transactions/{user_id}/{transaction_id}` to accept these fields.
2. **Goal Cover Image / Category Field:**
   - Add `image_url: str | None` and `category: str | None` to `GoalRow` in `backend/app/models.py`.

### Step 3: True Household Collaboration Engine (Effort: L | Priority: Long-Term)
1. **New Database Tables:**
   - `households (id, name, created_at)`
   - `household_members (id, household_id, user_id, role, invite_accepted)`
   - `household_invites (id, household_id, email, token, expires_at)`
2. **Update RLS & Backend Queries:**
   - Allow reading accounts and budgets where `user_id IN (SELECT user_id FROM household_members WHERE household_id = :user_household)`.
