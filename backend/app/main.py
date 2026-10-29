from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.api.budgets_router import router as budgets_router
from app.api.connectors_router import router as connectors_router
from app.api.copilot_feed_router import router as copilot_feed_router
from app.api.documents_router import router as documents_router
from app.api.goals_router import router as goals_router
from app.api.household_router import router as household_router
from app.api.networth_router import router as networth_router
from app.api.notifications_router import router as notifications_router
from app.api.profile_router import router as profile_router
from app.api.aa_router import router as aa_router
from app.api.plan_router import router as plan_router
from app.api.forecast_risk_router import router as forecast_risk_router
from app.api.routes import router
from app.api.rules_router import router as rules_router
from app.api.security_router import router as security_router
from app.api.expenses_router import router as expenses_router
from app.api.ocr_router import router as ocr_router
from app.api.translate_router import router as translate_router
from app.api.web_router import router as web_router
from app.api.voice_router import router as voice_router
from app.api.ops_router import router as ops_router
from app.api.jobs_router import router as jobs_router
from app.api.plaid_router import router as plaid_router
from app.api.pay_router import router as pay_router
from app.api.webhooks_router import router as webhooks_router
from app.api.tax_router import router as tax_router
from app.api.transactions_router import router as transactions_router
from app.core.audit import log_audit_event
from app.crypto_bridge.router import router as crypto_router

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Seed + warm the demo personas on every start (fresh deploy, serverless cold start, local emulator), without blocking boot.
    def _prepare_demo() -> None:
        try:
            from app.ingest.seed import ensure_demo_seeded

            ensure_demo_seeded()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Demo persona seeding skipped: %s", exc)

    import threading

    def _warm_models() -> None:
        # load OCR + CLIP now, off the request path, so the first upload/photo is not the slow one
        import logging

        try:
            from app.ocr import warm as warm_ocr
            from app.expenses import suggest as photo

            warm_ocr()
            photo._catalog_vectors()
            photo.vision._image_model()
        except Exception as exc:
            logging.getLogger(__name__).warning("Model warm-up skipped: %s", exc)

    threading.Thread(target=_prepare_demo, daemon=True).start()
    if not os.getenv("VERCEL"):  # serverless instances are short-lived: warm-up would only compete with the first request
        threading.Thread(target=_warm_models, daemon=True).start()
    yield


_prod_hint = bool(os.getenv("ALLOWED_ORIGINS", "").strip()) or bool(os.getenv("VERCEL"))
# /docs, /redoc and /openapi.json describe every route: on by default for local/demo runs, off when production origins
# are configured (or on Vercel) unless FINPILOT_ENABLE_DOCS=true.
_docs_on = os.getenv("FINPILOT_ENABLE_DOCS", "false" if _prod_hint else "true").lower() == "true"

app = FastAPI(
    title="FinPilot API", version="0.1.0", lifespan=lifespan,
    docs_url="/docs" if _docs_on else None, redoc_url="/redoc" if _docs_on else None, openapi_url="/openapi.json" if _docs_on else None,
)

# SECURITY: in dev, allow any localhost/127.0.0.1 port (next dev picks a
# different one whenever 3000 is busy). In production, ALLOWED_ORIGINS must
# be set explicitly to the real deployed frontend origin(s) -- comma
# separated -- so the API can't be called cross-origin from an arbitrary
# site with a signed-in user's cookies/token. Unset in prod = no prod
# origins trusted (fails closed, not open).
_prod_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# The localhost regex is dev-only: on by default only when no production origins are configured, or when
# ALLOW_LOCALHOST_CORS=true is set explicitly.
_allow_localhost = os.getenv("ALLOW_LOCALHOST_CORS", "" if _prod_origins else "true").lower() == "true"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_prod_origins,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$" if _allow_localhost else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
app.include_router(budgets_router, prefix="/api")
app.include_router(plan_router, prefix="/api")
app.include_router(forecast_risk_router, prefix="/api")
app.include_router(copilot_feed_router, prefix="/api")
# These already embed "/api/..." in each route's own path decorator
# (unlike routes.py/transactions_router/budgets_router, which rely on the
# prefix="/api" above) -- no prefix here, or paths would double up.
app.include_router(connectors_router)
app.include_router(goals_router)
app.include_router(documents_router)
app.include_router(ocr_router)
app.include_router(translate_router)
app.include_router(web_router)
app.include_router(voice_router)
app.include_router(ops_router)
app.include_router(jobs_router)
app.include_router(plaid_router)
app.include_router(pay_router, prefix="/api")
app.include_router(household_router)
app.include_router(networth_router)
app.include_router(notifications_router)
app.include_router(profile_router)
app.include_router(aa_router)
app.include_router(tax_router)
app.include_router(rules_router)
app.include_router(security_router)
app.include_router(expenses_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(crypto_router)  # CryptPilot bridge: already carries its own /api/crypto prefix


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
# Interactive docs load their UI from a CDN and inline scripts, so only they are exempt from the CSP.
_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """JSON API: never framed, never sniffed, no referrer, HTTPS only. The CSP forbids everything because an API response
    is data, not a page."""
    response = await call_next(request)
    for k, v in _SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    if not request.url.path.startswith(_DOC_PATHS):
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    return response


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    """Best-effort security audit trail (see app.core.audit): records every
    auth denial/rate-limit hit and every successful mutating request. The
    user_id here is extracted heuristically from the path (the last path
    segment after a known prefix) since middleware runs outside the
    per-route Depends() that resolves+verifies it -- good enough for a
    human reviewing logs, not used for any access-control decision."""
    response = await call_next(request)

    path = request.url.path
    method = request.method
    status = response.status_code
    if path.startswith("/api/crypto/"):
        return response  # anonymous wallet-check traffic is rate-limited by the bridge; not an audit-trail event (a flood would amplify writes)

    def _guess_user_id() -> str | None:
        parts = [p for p in path.split("/") if p]
        if len(parts) < 3 or parts[0] != "api":
            return None
        # user_id is always the 3rd segment for these resources (even when
        # further sub-path segments follow, e.g. /api/budgets/{user_id}/status
        # or /api/transactions/{user_id}/{transaction_id}).
        if parts[1] in {"transactions", "budgets", "goals", "tax", "rules", "household", "plan", "profile", "aa", "security", "connectors", "documents", "pay", "expenses", "plaid"}:
            return parts[2]

        # For these, user_id is the LAST segment (/api/dashboard/{user_id},
        # /api/alerts/gap/{user_id}, /api/accounts/{user_id}, etc.).
        if parts[1] in {"dashboard", "simulate", "upload", "events", "alerts", "accounts", "notifications"}:
            return parts[-1]
        # /api/ocr/extract/{user_id}, /api/ocr/import/{user_id}
        if parts[1] == "ocr" and len(parts) >= 4:
            return parts[3]
        # /api/networth/{user_id}/history
        if parts[1] == "networth":
            return parts[2]
        # /api/copilot/insights/{user_id}
        if parts[1] == "copilot":
            return parts[-1]
        return None

    try:
        if status in (401, 403, 429):
            await run_in_threadpool(
                log_audit_event,
                user_id=_guess_user_id(),
                event_type="rate_limited" if status == 429 else "auth_denied",
                method=method,
                path=path,
                status_code=status,
                client_ip=request.client.host if request.client else None,
            )
        elif method in _MUTATING_METHODS and 200 <= status < 300 and path.startswith("/api/"):
            await run_in_threadpool(
                log_audit_event,
                user_id=_guess_user_id(),
                event_type="mutation",
                method=method,
                path=path,
                status_code=status,
                client_ip=request.client.host if request.client else None,
            )
    except Exception:  # noqa: BLE001 - audit logging must never break a response
        pass

    return response
