# Data Flow & Execution Chains Per Pillar

This document traces the complete execution lifecycle for each capability across all four pillars: **UI Component → API Client Function → FastAPI Route → Service/Analytics Logic → DB Model/Table → Seed Data → Test Suite**.

---

## 1. TRACK: "Know where you stand"

### T1: Consolidated Accounts & Net Worth Over Time
- **UI Component**: [`frontend/components/dashboard/NetWorthTrend.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/dashboard/NetWorthTrend.tsx) mounted on [`frontend/app/(app)/dashboard/page.tsx:20`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/dashboard/page.tsx#L20)
- **API Client Function**: `api.netWorthHistory(userId, days)` in [`frontend/lib/api.ts:144`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L144)
- **FastAPI Route**: `GET /api/networth/{user_id}/history` in [`backend/app/api/networth_router.py:99`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/networth_router.py#L99)
- **Service/Logic**: `_reconstruct_account_daily_balances(account, txns, days, today)` walking backward from current balance $B - \sum \text{amount}$
- **DB Model/Table**: `AccountRow` (`accounts`), `TransactionRow` (`transactions`) in [`backend/app/models.py:19-47`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L19-L47)
- **Seed Data**: `backend/app/ingest/personas.py` (`PERSONA_DATA["demo-priya"]`, `demo-arjun`, `demo-meera`)
- **Test Suite**: [`backend/tests/test_networth_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_networth_router.py) (6 tests passing)

### T2: Filterable / Searchable Transaction Ledger & CSV Export
- **UI Component**: [`frontend/app/(app)/transactions/page.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/transactions/page.tsx#L100)
- **API Client Function**: `api.transactions(userId, filters)` in [`frontend/lib/api.ts:111`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L111)
- **FastAPI Route**: `GET /api/transactions/{user_id}` in [`backend/app/api/transactions_router.py:24`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/transactions_router.py#L24)
- **Service/Logic**: SQLModel dynamic filtering with `func.lower().like()`, date range filters, and pagination offset/limit
- **DB Model/Table**: `TransactionRow` (`transactions`) in [`backend/app/models.py:33`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L33)
- **Seed Data**: 580 transactions (`demo-priya`), 503 transactions (`demo-arjun`), 420 transactions (`demo-meera`)
- **Test Suite**: [`backend/tests/test_transactions_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_transactions_router.py) (12 tests passing)

### T3: Transaction Re-Categorization & Review Status
- **UI Component**: Category dropdown in [`frontend/app/(app)/transactions/page.tsx:327`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/transactions/page.tsx#L327)
- **API Client Function**: `api.updateTransaction(userId, txnId, update)` in [`frontend/lib/api.ts:119`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L119)
- **FastAPI Route**: `PATCH /api/transactions/{user_id}/{transaction_id}` in [`backend/app/api/transactions_router.py:76`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/transactions_router.py#L76)
- **Service/Logic**: Authorization check (`row.user_id == user_id`) + attribute mutation + commit
- **DB Model/Table**: `TransactionRow` (`transactions`). **NOTE:** `tags`, `notes`, and `reviewed` / `skip` boolean flags do not exist in DB schema.
- **Test Suite**: [`backend/tests/test_transactions_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_transactions_router.py) (test_patch_category)

### T4: Ingest Categorization Rules Engine
- **UI Component**: [`frontend/components/dashboard/AddDataPanel.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/components/dashboard/AddDataPanel.tsx) & `/transactions` CSV upload
- **API Client Function**: `api.upload(userId, file)` in [`frontend/lib/api.ts:150`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L150)
- **FastAPI Route**: `POST /api/upload/{user_id}` in [`backend/app/api/routes.py:138`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/routes.py#L138)
- **Service/Logic**: `backend/app/ingest/categorize.py:categorize(merchant, amount)` matching 16 regex categories + cosine similarity Gemini embeddings
- **DB Model/Table**: Writes parsed `TransactionRow` rows to `transactions` table
- **Test Suite**: [`backend/tests/test_ingest.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_ingest.py) (13 tests passing)

### T7: Security Audit Log Trail
- **UI Component**: [`frontend/app/(app)/security/page.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/security/page.tsx)
- **API Client Function**: Implicit (intercepts all mutating fetch calls)
- **FastAPI Route**: `audit_log_middleware` in [`backend/app/main.py:64-118`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/main.py#L64-L118)
- **Service/Logic**: `backend/app/core/audit.py:log_audit_event(user_id, event_type, method, path, status_code)`
- **DB Model/Table**: `AuditLogRow` (`audit_logs`) in [`backend/app/models.py:122-140`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L122-L140)
- **Test Suite**: [`backend/tests/test_audit.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_audit.py) (3 tests passing)

---

## 2. BUDGET: "Budgeting that fits your life"

### B1: Budgets CRUD & Category Monthly Limits
- **UI Component**: [`frontend/app/(app)/budgets/page.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/budgets/page.tsx)
- **API Client Function**: `api.budgets`, `api.createBudget`, `api.deleteBudget` in [`frontend/lib/api.ts:126-130`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L126-L130)
- **FastAPI Route**: `GET /api/budgets/{user_id}`, `POST /api/budgets/{user_id}`, `DELETE /api/budgets/{user_id}/{budget_id}` in [`backend/app/api/budgets_router.py:51-91`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/budgets_router.py#L51-L91)
- **Service/Logic**: Upsert on `(user_id, category)` + validation
- **DB Model/Table**: `BudgetRow` (`budgets`) in [`backend/app/models.py:109-120`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L109-L120)
- **Test Suite**: [`backend/tests/test_budgets_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_budgets_router.py) (10 tests passing)

### B2: Real Spend Computed from Live Transactions
- **UI Component**: Budget Progress Cards in [`frontend/app/(app)/budgets/page.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/budgets/page.tsx)
- **API Client Function**: `api.budgetStatus(userId)` in [`frontend/lib/api.ts:131`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L131)
- **FastAPI Route**: `GET /api/budgets/{user_id}/status` in [`backend/app/api/budgets_router.py:109`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/budgets_router.py#L109)
- **Service/Logic**: `_spent_this_month(df, b.category, today)` filtering current calendar month and summing outflows
- **DB Model/Table**: `BudgetRow` + `TransactionRow`

### B4: Safe-to-Spend Headroom Calculation
- **UI Component**: Safe to Spend tile on Dashboard & Budgets page
- **API Client Function**: `api.safeToSpend(userId)` in [`frontend/lib/api.ts:132`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L132)
- **FastAPI Route**: `GET /api/budgets/{user_id}/safe-to-spend` in [`backend/app/api/budgets_router.py:182`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/budgets_router.py#L182)
- **Service/Logic**: `(monthly_income - committed_recurring - discretionary_spent) / days_remaining` floored at 0
- **DB Model/Table**: Evaluated dynamically from `TransactionRow`

---

## 3. COLLABORATE: "Make smart money moves together"

- **C1 Household/Workspace Tables**: ❌ **MISSING** (No DB table or schema exists)
- **C2 Invite Flow via Resend**: ❌ **MISSING** (No backend invite endpoints or acceptance tokens)
- **C3 Multi-User Roles & RLS**: ❌ **MISSING** (RLS policies strictly check `auth.uid() = user_id`)
- **C4 Shared Net Worth / Accounts**: ❌ **MISSING** in backend; ⚠️ **MOCK** on landing page (`scenes/CollaborateScene.tsx`)
- **C5 Shared Budgets / Goals**: ❌ **MISSING** (Single-tenant `user_id` foreign keys only)
- **C6 Privacy Flag per Account**: ❌ **MISSING** (No `is_private` or `hide_from_household` column on `AccountRow`)

---

## 4. PLAN: "Set goals (and crush them)"

### P1: Financial Goals CRUD & Persistence
- **UI Component**: [`frontend/app/(app)/goals/page.tsx`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/app/(app)/goals/page.tsx)
- **API Client Function**: `api.goals`, `api.createGoal`, `api.updateGoal`, `api.deleteGoal` in [`frontend/lib/api.ts:135-141`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/frontend/lib/api.ts#L135-L141)
- **FastAPI Route**: `GET /api/goals/{user_id}`, `POST /api/goals/{user_id}`, `PATCH /api/goals/{user_id}/{goal_id}`, `DELETE /api/goals/{user_id}/{goal_id}` in [`backend/app/api/goals_router.py:74-134`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/api/goals_router.py#L74-L134)
- **Service/Logic**: `GoalRow` mutation + dynamic monthly contribution calculation via `_estimated_monthly_contribution`
- **DB Model/Table**: `GoalRow` (`goals`) in [`backend/app/models.py:72-81`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/models.py#L72-L81)
- **Test Suite**: [`backend/tests/test_goals_router.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_goals_router.py) (6 tests passing)

### P5: Monthly Contribution & On-Track Projection
- **UI Component**: Progress status badges & projected dates in `/goals`
- **API Client Function**: `api.goals(userId)`
- **FastAPI Route**: `GET /api/goals/{user_id}`
- **Service/Logic**: `backend/app/analytics/goals.py:project_goal(goal, monthly_contribution)` computing `months_remaining`, `projected_completion_date`, and `on_track`
- **DB Model/Table**: `GoalRow` + `TransactionRow`

### P6: Emergency Fund Health Score & Simulation Engine Linkage
- **UI Component**: Health score radar on `/dashboard` and Action picker on `/simulate`
- **API Client Function**: `api.dashboard(userId)`, `api.simulate(userId, req)`
- **FastAPI Route**: `GET /api/dashboard/{user_id}`, `POST /api/simulate/{user_id}`
- **Service/Logic**: `ActionType.build_emergency_fund` in [`backend/app/simulate/engine.py:353`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/simulate/engine.py#L353) and `compute_emergency_fund_score` in [`backend/app/analytics/health_score.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/app/analytics/health_score.py)
- **Test Suite**: [`backend/tests/test_forecast_sim.py`](file:///c:/Users/poona/OneDrive/Desktop/hackamatrix/hackmatrix/backend/tests/test_forecast_sim.py) (22 tests passing)
