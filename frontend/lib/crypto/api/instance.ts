import { createApiClient, type ApiClientOptions } from "./client";

/** FinPilot's backend proxies this prefix to the crypto service (Cryptiq): see backend/app/crypto_bridge. */
export const CRYPTO_API_BASE = "/api/crypto";

export const apiOptions: ApiClientOptions = { baseUrl: CRYPTO_API_BASE };

/** The one client for wallet checks, credits, invoices, transcription, benchmark. Same-origin, cookie session. */
export const api = createApiClient(apiOptions);
