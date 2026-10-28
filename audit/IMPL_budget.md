# Implementation Report: Pillar 5B (BUDGET)

## 1. Overview & Scope
Implemented full backend envelope rollover math, dynamic over-budget and near-limit real-time notifications, budget update endpoint (`PATCH /api/budgets/{user_id}/{budget_id}`), and UI enhancements on `/budgets` including rollover status pills, rollover switch toggles, and live over-budget alerts.

---

## 2. Files Changed

### Backend
- `backend/app/models.py`: Added `rollover_enabled` (bool, default False), `rollover_cap` (float | None, default None), and `created_at` (datetime) to `BudgetRow`.
- `backend/app/core/db.py`: Added idempotent column creation checks (`check_and_add_column`) for SQLite and Postgres on startup.
- `supabase/migrations/0005_budget_rollover.sql`: Production migration with SQL columns and comments.
- `backend/app/schemas.py`:
  - Added `rollover_enabled` and `rollover_cap` to `Budget`, `BudgetCreateRequest`, `BudgetUpdateRequest`.
  - Added `rollover_amount` and `effective_limit` to `BudgetStatus`.
  - Added `over_budget` to `NotificationType`.
- `backend/app/api/budgets_router.py`:
  - Implemented `_compute_rollover(session, user_id, category, monthly_limit, rollover_cap, up_to_month)` looking back up to 12 months.
  - Added `PATCH /api/budgets/{user_id}/{budget_id}` for updating limit, category, and rollover settings with audit log tracking.
  - Updated status calculations to compute `effective_limit = monthly_limit + rollover_amount` and compute `is_over_budget = spent > effective_limit`.
- `backend/app/api/notifications_router.py`:
  - Added automated checks over current month budgets to emit `over_budget` critical alerts when spending reaches $\ge 100\%$ of effective limit, and warning alerts when spending $\ge 80\%$.
- `backend/app/ingest/personas.py` & `backend/app/ingest/seed.py`:
  - Seeded 5 standard envelope budgets for demo personas (`demo-priya`, `demo-arjun`, `demo-meera`) with `rollover_enabled=True`.
- `backend/tests/test_budget_rollover.py`: 6 dedicated unit & integration tests covering rollover accumulation, capping, PATCH updates, cross-user isolation, and over-budget notifications.

### Frontend
- `frontend/lib/types.ts`: Added `rollover_enabled`, `rollover_cap`, `rollover_amount`, and `effective_limit` to `Budget` and `BudgetStatus`.
- `frontend/lib/api.ts`: Added `updateBudget(userId, budgetId, payload)` API helper.
- `frontend/app/(app)/budgets/page.tsx`:
  - Added **Over-Budget Warning Banner** at top of page when any category exceeds limit.
  - Added **Rollover Surplus Pill** (`+₹X Rollover Surplus`) next to monthly limit.
  - Added **Effective Cap breakdown** (`Effective cap: ₹Y`) under progress bars.
  - Added quick **Rollover Toggle Switch** per budget card with optimistic UI updates.

---

## 3. New / Updated Endpoints

| Method | Path | Request Body | Response | Notes |
|---|---|---|---|---|
| `PATCH` | `/api/budgets/{user_id}/{budget_id}` | `BudgetUpdateRequest` (`monthly_limit`, `rollover_enabled`, `rollover_cap`, etc.) | `Budget` | Updates envelope config with audit event |
| `GET` | `/api/budgets/{user_id}/status` | Query params: `month` (optional) | `list[BudgetStatus]` | Returns `rollover_amount` and `effective_limit` |
| `GET` | `/api/notifications/{user_id}` | None | `list[Notification]` | Emits `over_budget` notification on high spend |

---

## 4. Verification & Testing

1. **Backend Tests:**
   ```bash
   py -3.11 -m pytest
   # Result: 176 passed in 72s
   ```
2. **Frontend Build:**
   ```bash
   cd frontend && npm run build
   # Result: Compiled successfully with zero TypeScript or Next.js build errors
   ```

### 2-Minute Manual Testing Guide
1. Launch backend (`py -3.11 -m uvicorn app.main:app --port 8000`) and frontend (`npm run dev`).
2. Visit `http://localhost:3000/budgets`.
3. Select persona `demo-priya`.
4. Observe the "+₹... Rollover Surplus" badge and effective limit on envelopes where unspent funds carried over from previous months.
5. Click the "Rollover" switch on any envelope to toggle rollover on/off and watch the effective limit recalculate immediately.
6. Trigger a high expense or view a persona with high expenses to see the top Over-Budget alert banner.

---

## 5. Limitations & Future Extensions
- Rollover currently looks back up to 12 calendar months; historical transactions prior to 12 months are excluded from rollover surplus.
