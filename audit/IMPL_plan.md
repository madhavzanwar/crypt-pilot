# Implementation Report: Pillar 5C (PLAN)

## 1. Overview & Scope
Implemented full backend and frontend architecture for **Pillar 5C (PLAN)**:
- **Visual Goal Cover Art**: Curated SVG collection (`emergency_fund`, `dream_car`, `luxury_travel`, `home_downpayment`, `higher_education`, `tech_setup`, `retirement`, `wedding`, `general`) rendered as photo-style card headers and available in an interactive cover picker.
- **Funding Account Auto-Tracking**: Goals can be linked to any real user account (`funding_account_id`). When `auto_track` is active, goal progress automatically syncs with the linked account's current balance.
- **Required Monthly Savings Calculation**: Dynamic formula `round((target_amount - current_amount) / max(months_to_target, 1), 2)` computed by the backend and displayed with interactive "Tune Targets" slider controls on the frontend.
- **Full Database & Persona Integration**: Migrations in SQLite and Postgres (`0006_goal_covers_autotrack.sql`), automatic seed data for demo personas with realistic covers, linked funding accounts, and auto-track states.

---

## 2. Files Changed

### Backend
- `backend/app/models.py`:
  - Added `cover_key: str = "general"`, `funding_account_id: str | None = None`, `auto_track: bool = False` to `GoalRow`.
- `backend/app/core/db.py`:
  - Added idempotent column migration checks for `cover_key`, `funding_account_id`, `auto_track` in `goals` table.
- `supabase/migrations/0006_goal_covers_autotrack.sql`:
  - Migration script for Supabase Postgres.
- `backend/app/schemas.py`:
  - Added `cover_key`, `funding_account_id`, `auto_track` to `Goal`, `GoalCreateRequest`, `GoalUpdateRequest`.
  - Added `required_monthly: float = 0.0` to `GoalProgress`.
- `backend/app/api/goals_router.py`:
  - Calculated `required_monthly` from target amount, current amount, and target date.
  - Added funding account ownership validation (returns 400 if account does not belong to user).
  - Resolved `current_amount` dynamically from linked account balance when `auto_track=True`.
  - Supported updating `cover_key`, `funding_account_id`, `auto_track`, `target_amount`, `target_date` in `PATCH /api/goals/{user_id}/{goal_id}`.
- `backend/app/ingest/personas.py` & `backend/app/ingest/seed.py`:
  - Extended `PersonaData` to include `goals` and seeded 2–3 realistic goals with covers and funding links for `demo-priya`, `demo-arjun`, `demo-meera`.
- `backend/tests/test_plan_goals.py`:
  - 6 new tests covering listing, creation with auto-track, funding account validation, patch updates, cross-user isolation, and deletion.

### Frontend
- `frontend/public/goal-covers/`:
  - Added 9 high-quality SVG vector banners (`emergency_fund.svg`, `dream_car.svg`, `luxury_travel.svg`, `home_downpayment.svg`, `higher_education.svg`, `tech_setup.svg`, `retirement.svg`, `wedding.svg`, `general.svg`).
- `frontend/lib/types.ts`:
  - Updated `Goal`, `GoalProgress`, `CreateGoalRequest`, and `UpdateGoalRequest` with `cover_key`, `funding_account_id`, `auto_track`, `required_monthly`.
- `frontend/app/(app)/goals/page.tsx`:
  - **Cover Photo Header**: Each card displays a full-bleed SVG cover header matching the PLAN showcase design.
  - **Cover Picker Modal**: Visual gallery selector for goal covers when creating a goal.
  - **Funding Account Selector & Auto-Track Toggle**: Dropdown to select existing accounts and toggle auto-sync with live balance.
  - **Interactive Tune Targets Drawer**: Slider to adjust target amount with real-time required monthly pace recalculation.
  - **Pace Telemetry**: Badges indicating "On Track", "Ahead of Target", or "Pace Needed".

---

## 3. New & Updated Endpoints

| Method | Path | Request Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/goals/{user_id}` | None | `list[GoalProgress]` | Returns goals with `cover_key`, `funding_account_id`, `auto_track`, and `required_monthly` |
| `POST` | `/api/goals/{user_id}` | `GoalCreateRequest` | `GoalProgress` | Validates funding account and initializes auto-track balance |
| `PATCH` | `/api/goals/{user_id}/{goal_id}` | `GoalUpdateRequest` | `GoalProgress` | Updates cover, target, date, funding link, or auto-track |
| `DELETE` | `/api/goals/{user_id}/{goal_id}` | None | `{"deleted": true, "id": str}` | Deletes goal with ownership check |

---

## 4. Verification & Testing

1. **Backend Tests:**
   ```bash
   py -3.11 -m pytest
   # Result: 182 passed in 57.60s
   ```
2. **Frontend Build:**
   ```bash
   cd frontend && npm run build
   # Result: Compiled successfully with zero TypeScript / Next.js build errors
   ```

### 2-Minute Manual Testing Guide
1. Start backend (`py -3.11 -m uvicorn app.main:app --port 8000`) and frontend (`npm run dev`).
2. Visit `http://localhost:3000/goals`.
3. Switch persona to `demo-priya`:
   - Inspect the "Emergency Fund" goal card with the Emerald Safety cover and linked "Priya Savings - HDFC" account showing "Auto-Tracking Active".
   - Inspect the "Dream Car (EV)" goal card with the Orange Coupe cover and required monthly pace.
4. Click **Tune** on any goal card to open the Target Capital slider and adjust the amount; watch the required monthly savings recalculate live.
5. Create a new goal: select a custom cover style from the Cover Style picker (e.g. "Pro Tech Setup" or "Luxury Travel"), pick a linked account, enable auto-tracking, and submit.

---

## 5. Limitations & Future Extensions
- Auto-tracking currently uses the latest account balance; future extensions could support sub-bucket allocation if multiple goals link to the same account.
