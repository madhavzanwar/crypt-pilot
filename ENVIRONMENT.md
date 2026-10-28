# FinPilot: environment setup

Every key the project reads, where to get it, and where it goes. **This file lists names only. Never put real values in Git, in this file, or in chat.** Share the real values with teammates through a password manager or a private message.

## Where each file lives

| File | Used by | Git |
|---|---|---|
| `backend/.env` | FastAPI backend, local runs | ignored |
| `frontend/.env.local` | Next.js frontend, local runs | ignored |
| Vercel → Project → **Settings → Environment Variables** | the deployed site | n/a |

Start from `.env.example` at the repo root. After changing a Vercel variable, **redeploy**. Changes only apply to new deployments.

## 1. Firebase (so data persists)

Without it the app still runs, on temporary in-memory demo data.

| Variable | Where | What / how to get it |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | backend, Vercel | Firebase Console → Project settings → Service accounts → **Generate new private key**. Paste the **whole JSON** as the value. Locally you can instead set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file's path. |
| `FIREBASE_PROJECT_ID` | backend, Vercel | Your Firebase project ID. |
| *(Firestore database)* | Firebase Console | Build → **Firestore Database** → create it in **Native mode**. |

## 2. Firebase web config (sign-in)

Firebase Console → Project settings → **Your apps** → web app config. Put these in `frontend/.env.local` and in Vercel.

`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, and optionally `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`.

## 3. Chatbot AI (strongly recommended)

| Variable | Where | What / how to get it |
|---|---|---|
| `NVIDIA_API_KEY` | backend, Vercel | A free key from **build.nvidia.com**. This turns on the real AI answers. |
| `NVIDIA_CHAT_API_KEY` | backend | Optional second key for the chat model. |
| `NVIDIA_VISION_API_KEY`, `NVIDIA_VISION_MODEL` | backend | Optional. Key and model for reading bills and naming items in photos (defaults to `NVIDIA_API_KEY` and a hosted Llama 3.2 vision model). |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | backend | Optional. When set, photo recognition (Photo prices tab, bills) uses Gemini first and falls back to the NVIDIA vision model. Model defaults to `gemini-3.1-flash-lite`. |
| `NVIDIA_MODEL`, `NVIDIA_CHAT_MODEL`, `NVIDIA_EMBED_MODEL` | backend | Optional model overrides. Sensible defaults are built in. |
| `NUGEN_API_KEY`, `NUGEN_MODEL` | backend | Optional. Second-opinion model. |
| `FIRECRAWL_API_KEY` | backend | Optional. Enables live web search for questions that need current facts. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `HR_ALERT_EMAIL` | backend | Optional. Alert emails. |

## 4. Production URL and CORS

- `ALLOWED_ORIGINS` (backend, Vercel): set it to your Vercel URL, for example `https://your-app.vercel.app`. Use a comma-separated list for more than one.
- `NEXT_PUBLIC_API_URL`: **do not set on Vercel**. The frontend and backend share one domain there. Locally it defaults to `http://127.0.0.1:8000`.

## 5. Account Aggregator (optional)

The mock flow needs nothing. These switch on the real Setu sandbox. All four must be set, otherwise the mock keeps being used.

| Variable | Where | What |
|---|---|---|
| `AA_PROVIDER` | backend, Vercel | `setu` |
| `AA_CLIENT_ID`, `AA_CLIENT_SECRET` | backend, Vercel | From Setu Bridge (bridge.setu.co) after creating the AA product. |
| `AA_PRODUCT_INSTANCE_ID` | backend, Vercel | The product's ID from Bridge. |
| `AA_BASE_URL` | backend | Optional. Defaults to the Setu sandbox. |
| `AA_MOCK_SECRET` | backend, Vercel | Optional. Any long random string. Signs the mock's consent tokens. |
| `SETU_STATUS_WEBHOOK_SECRET` | backend, Vercel | Signing secret of the Setu status-page webhook (`POST /api/webhooks/setu-status`). Without it notices are not checked. |

## 6. Background jobs (Inngest, optional)

| Variable | Where | What |
|---|---|---|
| `INNGEST_DEV=1` | `frontend/.env.local` **only** | Local development. Do not set on Vercel. |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | Vercel | From the Inngest dashboard. |
| `BACKEND_URL` | Vercel | The deployed backend's public URL. Defaults to `http://127.0.0.1:8000`. |
| `INNGEST_JOB_TOKEN` | backend **and** frontend (Vercel) | Any long random string. The Inngest function sends it as `X-Job-Token`; the backend's `/api/jobs/*` stages refuse every call without it (503 when unset). |
| `INNGEST_EVENT_KEY` | backend | Lets `POST /api/security/{user}/investigate-job` send the start event. Not needed locally with `INNGEST_DEV=1`. |

## 7. Other switches

- `FINPILOT_DEMO_MODE` (default `true`): demo personas and seeded data.
- `FINPILOT_NO_CACHE`: set to any value to turn off the backend read cache.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google Sheets connector.
- `FIRESTORE_EMULATOR_HOST`: only for local and test runs against the Firestore emulator.

## Quick start for a teammate

1. Copy `.env.example` to `backend/.env` and `frontend/.env.local`, then ask the owner for the values.
2. Backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000`.
3. Frontend: `cd frontend && npm install && npm run dev`.
4. Tests (need the Firestore emulator): `firebase emulators:exec --only firestore --project demo-hackmatrix "python -m pytest backend"`.
