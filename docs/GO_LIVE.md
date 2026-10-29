# Go live: the five things only you can do

These cannot be done from the development sandbox, which can only make outgoing HTTPS requests through a proxy (no
inbound traffic, no tunnels, no wallets, no accounts). Each step says what to do and **how to check it worked**.
Everything is free and test-mode / testnet only. Never paste a key into chat or a commit; put them in `.env` files.

**Status: none of these steps has been performed by the project. This file is a checklist, not a record of what works.** Each "Check" says what you should see; record what you actually saw in `docs/CRYPTPILOT.md`.

Order: 0 -> 1 -> 2 (Dodo) -> 3 (Bitcoin testnet) -> 4 (attestation) -> 5 (Wispr, optional).

## 0. Run the stack on your laptop with a public URL (about 15 minutes)

Prerequisites (Windows: `winget install ...`): Git, Node 20+, Python 3.11+, `uv` (`astral-sh.uv`), `cloudflared`
(`Cloudflare.cloudflared`). The Elliptic++ data and model are fetched from your **private** Hugging Face dataset repo.

1. `git clone https://github.com/madhavzanwar/crypt-pilot` and `cd crypt-pilot`.
2. Backend deps once: `cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements-local.txt && cd ..`
   (Linux/macOS: `.venv/bin/pip`).
3. Start the tunnel in its own terminal and keep it open: `cloudflared tunnel --url http://localhost:3100`.
   It prints `https://<random-words>.trycloudflare.com`. That is your **public URL**; it changes every time you restart
   the tunnel, so update Dodo's webhook (step 2) when it does.
4. Create ONE file named `.env` in the repo root (git ignores it; the start script reads it and passes every value to all three
   processes; names are in `crypto-service/.env.example`):
   `APP_ENV=prod`, `SESSION_SECRET`, `LOG_SALT`, `ADMIN_TOKEN` (each `openssl rand -hex 32`), `COOKIE_SECURE=true`,
   `GRAPH_ENGINE` (`tigergraph`, with `TG_HOST`, `TG_GRAPH=Cryptiq`, `TG_SECRET`; or `networkx`, which needs about 2.6 GB of RAM and no TigerGraph), `LLM_PROVIDER=openai_compatible`,
   `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_JSON_MODE=true`, `SARVAM_API_KEY`, `SARVAM_STT_MODEL=saaras:v4`,
   `SARVAM_TTS_MODEL=bulbul:v4-flash`, `ARTIFACTS_REPO=<you>/cryptiq-artifacts`, `HF_TOKEN` (read-only token).
   TigerGraph Savanna auto-suspends idle workspaces (it was suspended on 2026-10-29); resume it in the Savanna console first, or use `networkx`.
   The launchers read `.env` as plain `KEY=value` lines (one pair of outer quotes is removed), so JSON values such as `PACKS_JSON` can be written as-is.
5. Start everything with the public URL:
   - PowerShell: `$env:FRONTEND_URL="https://<your-tunnel>.trycloudflare.com"; $env:CRYPTPILOT_WEB_MODE="prod"; powershell -ExecutionPolicy Bypass -File scripts\run_cryptpilot_demo.ps1`
   - bash: `FRONTEND_URL=https://<tunnel> CRYPTPILOT_WEB_MODE=prod scripts/run_cryptpilot_demo.sh`

   `prod` builds the frontend (about a minute); the dev server refuses tunnel hostnames.

**Check:** open `https://<tunnel>/api/crypto/status` in a browser. You want
`{"configured":true,"reachable":true,"engine":"<tigergraph or networkx, whichever you set>","dataSource":"elliptic++", ...}`.
Then open `https://<tunnel>`, press "Explore Demo App", open Wallet Guard, run the BLOCK example.
(The PowerShell script has never been run on Windows. If it fails, the error is in `.demo-logs/*.err.log`. The bash script is the one that has been exercised, on Linux only.)

## 0b. Hosted site + crypto-service on your laptop (free split deployment)

Use this instead of step 0 when the frontend and FinPilot API are hosted (Vercel / Render) and only the heavy crypto-service
(about 2.6 GB RAM with the NetworkX engine, and a SQLite credit ledger that needs a disk that survives restarts) stays on your laptop.
Path of a request: browser -> hosted frontend (`/api/crypto/*`) -> hosted FinPilot API bridge -> Cloudflare tunnel -> crypto-service.

1. On the laptop run `scripts/run_crypto_service_laptop.sh` (Windows: `powershell -ExecutionPolicy Bypass -File scripts\run_crypto_service_laptop.ps1`).
   It fetches the data/model if `ARTIFACTS_REPO`/`HF_TOKEN` are set, starts the service, opens a quick tunnel and prints `CRYPTO_SERVICE_URL=https://....trycloudflare.com`.
2. Set `CRYPTO_SERVICE_URL` to that value on the hosted FinPilot API and redeploy/restart it. The frontend needs `BACKEND_URL` = the hosted API (not the tunnel).
3. Set the Dodo webhook to `https://<hosted API or site>/api/crypto/webhooks/dodo` (events `payment.succeeded`, `payment.refunded`, `refund.succeeded`, `dispute.accepted`, `dispute.lost`) and `FRONTEND_URL` to the hosted site.
4. The quick-tunnel URL changes on every start. Repeat step 2 each time, or use a named Cloudflare tunnel (free, needs a domain) for a stable URL.

**Check:** `curl <tunnel>/api/health` answers, then `https://<hosted site>/api/crypto/status` shows `"reachable":true`.
Security note: the tunnel exposes the whole crypto-service, not just the bridge's route allowlist (admin routes need `ADMIN_TOKEN`; there is no shared secret between the bridge and the service yet). Fine for a demo; do not leave it up unattended.

## 1. (included in step 0)

## 2. Dodo Payments: one real test checkout

1. app.dodopayments.com: switch the toggle at the bottom left to **Test Mode** (not Live).
2. Products -> create a **one-time** product "Starter, 5 credits", price **$1**. Copy its id (`pdt_...`).
3. Developer -> API keys -> create a **test** key. Put in the root `.env`: `DODO_API_KEY`, `DODO_ENV=test_mode`
   and `PACKS_JSON=[{"id":"starter","credits":5,"priceUsd":1,"label":"Starter","dodoProductId":"pdt_..."}]`.
4. Developer -> Webhooks -> add endpoint `https://<tunnel>/api/crypto/webhooks/dodo`, event **payment.succeeded**.
   Copy the **signing secret** into `DODO_WEBHOOK_SECRET`. Restart the stack (`... stop`, then start again).
5. In the app: Credits -> "Pay by card (test mode)". Dodo's hosted page opens; pay with Dodo's test card
   (check Dodo's docs for the current number; it is not a real card).

**Check (all four):** you are returned to `/credits/success`; the credits pill goes up by 5 (and stays up after
a reload); in Dodo -> Webhooks the delivery shows `200`; replaying the same delivery from Dodo's dashboard does **not**
add credits a second time (the service is meant to de-duplicate by event id; this is unit-tested only, so confirm it here). A wrong signature must return `401`:
`curl -i -X POST https://<tunnel>/api/crypto/webhooks/dodo -d "{}"` -> `401 invalid_signature`.

## 3. Bitcoin testnet: one real invoice paid

1. Install Electrum, start it with `electrum --testnet`, create a wallet, copy a receive address starting `tb1`.
2. Get free test coins from any "bitcoin testnet faucet" (search for one; they come and go).
3. In the root `.env`: `BTC_NETWORK=testnet`, `BTC_RECEIVE_ADDRESS=tb1...`,
   `BTC_EXPLORER_BASE_URL=https://blockstream.info/testnet/api` (the Electrum testnet; this explorer was verified live
   against the client), `BTC_CONFIRMATIONS=0`, `BTC_SATS_PER_USD=2000` (a made-up test rate). Restart.
4. Credits -> "Cake Wallet (BTC testnet / XMR demo)" -> Bitcoin (testnet) -> Create testnet invoice. Send **exactly** the
   shown amount (the last digits make it unique) to the shown address from Electrum (or scan the QR with any testnet wallet).

**Check:** within a minute or two the invoice flips to "paid" and credits rise once.

## 4. Wallet signing: one real attestation on Base Sepolia

1. Install MetaMask (or any browser wallet), add the **Base Sepolia** network, get free test ETH from a Base Sepolia faucet.
2. Register the schema once at https://base-sepolia.easscan.org/schema/create with exactly this string, no resolver,
   revocable on: `string subjectAddress,string chain,uint8 riskScore,string verdict,bytes32 reportHash`. Copy the schema UID.
3. In the root `.env`: `NEXT_PUBLIC_EAS_SCHEMA_UID=0x...` (and optionally `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
   These are inlined at build time: restart the stack so it rebuilds.
4. Wallet Guard -> run a BLOCK or WARN check -> "Attest on Base Sepolia" -> connect -> switch network -> sign.
   Also try Statement -> "Anchor this statement on Base Sepolia".

**Check:** the success card shows an attestation UID and an easscan link that opens the attestation; "Verify" says match.

## 5. Wispr Flow (optional, needs access)

Set `WISPR_API_KEY` in the root `.env` and restart. In Copilot, record a short clip: the chip reads "Wispr Flow"
only if the service really used it. Without a key it says Sarvam or Browser speech, which is correct.

## What "done" looks like

All of: `/api/crypto/status` reachable; a Dodo test payment adds credits exactly once; a testnet invoice is paid;
an attestation UID opens on easscan. Then update the status table in `docs/CRYPTPILOT.md` with what you actually saw.
