# Implementation Report: 5A TRACK Pillar

## 1. Summary of Changes
The Track pillar in FinPilot has been upgraded from a basic manual recategorization endpoint into an audited, intelligent transaction review workflow with customizable categorization rules and double-entry ledger auditing.

### Key Capabilities Implemented:
1. **Transaction Review Workflow**:
   - `review_status` state machine (`pending`, `reviewed`, `skipped`).
   - `reviewed_at` UTC timestamp recorded upon review confirmation or skip.
   - Per-transaction `tags` (JSON string list) and audit `notes`.
   - Dedicated Review Queue endpoint (`GET /api/transactions/{user_id}/review-queue`) retrieving next pending batch.
   - One-click review endpoint (`POST /api/transactions/{user_id}/{transaction_id}/review`) supporting confirm, recategorize, skip, and auto-rule creation.
2. **User Categorization Rules Engine**:
   - `categorization_rules` table with Postgres Row Level Security (RLS) and SQLite fallback.
   - Flexible match types: `contains` substring, `exact` match, `starts_with`, and `regex`.
   - `apply_to_existing` option to retroactively reclassify and review historical matching transactions.
   - Precedence: User custom rules are evaluated first before global dictionaries and Gemini embeddings.
3. **Interactive UI (`/transactions`)**:
   - Smart Review Deck matching the showcase TRACK scene (frames 01–04, 13) with fluid Framer Motion spring transitions.
   - Keyboard shortcuts (`Enter` to Confirm classification, `S` to Skip).
   - "Always categorize [merchant] as [category]" checkbox toggle.
   - Custom Rules Manager modal to view, add, and delete categorization rules.
   - Interactive ledger table with review status chips, tag pills, note indicators, and inline tag/note editing drawer.
   - Audited CSV export including tags, notes, and review status.

---

## 2. Files Changed & Added
- `backend/app/models.py`:
  - Added `tags`, `notes`, `review_status`, `reviewed_at` columns to `TransactionRow`.
  - Added `CategorizationRuleRow` model.
- `backend/app/core/db.py`:
  - Added idempotent `_run_migrations(engine)` executing `ALTER TABLE transactions ADD COLUMN ...` on startup.
- `supabase/migrations/0004_transaction_review_rules.sql`:
  - Migration script for Supabase Postgres with RLS policies and index creation.
- `backend/app/schemas.py`:
  - Added `ReviewStatus`, `RuleMatchType`, `ReviewAction`, `ReviewTransactionRequest`, `ReviewQueueResponse`, `CategorizationRule`, `CategorizationRuleCreate`, `CategorizationRuleList`.
  - Extended `Transaction` and `TransactionUpdate`.
- `backend/app/ingest/categorize.py`:
  - Added `matches_pattern` helper.
- `backend/app/api/transactions_router.py`:
  - Added `/transactions/{user_id}/review-queue`.
  - Added `/transactions/{user_id}/{transaction_id}/review`.
  - Added `review_status` and `tag` filter queries to `GET /transactions/{user_id}`.
  - Updated `PATCH /transactions/{user_id}/{transaction_id}` with tags/notes.
- `backend/app/api/rules_router.py`:
  - Created `GET/POST/DELETE /api/rules/{user_id}`.
- `backend/app/main.py`:
  - Mounted `rules_router` and updated audit middleware user resolution.
- `backend/app/ingest/personas.py` & `backend/app/ingest/seed.py`:
  - Seeded demo personas (`demo-priya`, `demo-arjun`, `demo-meera`) with 12 pending transactions, reviewed transactions with tags/notes, and active rules.
- `backend/tests/test_review_rules.py`:
  - 11 new pytest test cases (170/170 total backend tests passing).
- `frontend/lib/types.ts` & `frontend/lib/api.ts`:
  - TypeScript types and API client functions.
- `frontend/app/(app)/transactions/page.tsx`:
  - Complete review deck, rules manager modal, and ledger table enhancements.

---

## 3. New Endpoints Specification

### `GET /api/transactions/{user_id}/review-queue`
- **Query Params**: `limit: int = 20`
- **Response**:
```json
{
  "pending_count": 12,
  "items": [
    {
      "id": "uuid",
      "user_id": "demo-priya",
      "account_id": "acc-checking-priya",
      "date": "2026-03-28",
      "amount": -450.0,
      "merchant": "Swiggy Order #9812",
      "category": "dining",
      "tags": ["Food"],
      "notes": null,
      "review_status": "pending",
      "reviewed_at": null
    }
  ]
}
```

### `POST /api/transactions/{user_id}/{transaction_id}/review`
- **Request Body**:
```json
{
  "action": "confirm | recategorize | skip",
  "category": "dining",
  "tags": ["Food", "Delivery"],
  "notes": "Late night meal",
  "create_rule": true,
  "rule_pattern": "Swiggy"
}
```
- **Response**: Updated `Transaction` object.

### `GET /api/rules/{user_id}`
- **Response**:
```json
{
  "total": 2,
  "items": [
    {
      "id": "uuid",
      "user_id": "demo-priya",
      "match_type": "contains",
      "pattern": "Netflix",
      "category": "subscriptions",
      "tags": ["Subscription"],
      "created_at": "2026-03-01T00:00:00Z"
    }
  ]
}
```

### `POST /api/rules/{user_id}`
- **Request Body**:
```json
{
  "match_type": "contains",
  "pattern": "Blinkit",
  "category": "groceries",
  "tags": ["Essentials"],
  "apply_to_existing": true
}
```

### `DELETE /api/rules/{user_id}/{rule_id}`
- **Response**: `{"ok": true, "deleted_id": "uuid"}`

---

## 4. How to Test in 2 Minutes

1. **Run Backend Tests**:
   ```powershell
   cd backend
   py -3.11 -m pytest
   ```
   *Expected result: 170 passed.*

2. **Run Demo Persona Seed**:
   ```powershell
   py -3.11 -m app.ingest.seed
   ```

3. **Verify in UI**:
   - Navigate to `http://localhost:3000/transactions`.
   - The **Smart Review Deck** appears at the top showing pending transactions with merchant name, amount, category dropdown, and tags.
   - Press `Enter` to confirm classification or click **Confirm Classification** (watches card smoothly transition to next pending transaction).
   - Click **Rules (2)** in the header to open the Custom Rules Manager modal. Add a rule with `apply_to_existing: true` and observe matching transactions instantly reclassified.
   - In the transaction ledger below, check the status badges (`Pending`, `Reviewed`, `Skipped`) and click `+ Tag / Note` on any row to open the inline editor.

---

## 5. Remaining Limitations / Next Step
- 5A is fully implemented and tested.
- Next step in the sequence is **5B BUDGET**: envelope rollover formula, live over-budget alerts in notifications router, and budget simulator integration.
