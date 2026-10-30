"""Security audit trail: persists authentication denials and data-mutating
requests to `audit_logs` (Firestore collection, see app.core.store).

Kept deliberately fire-and-forget: a failure to write an audit row must
never break the actual request it's describing.
"""
from __future__ import annotations

import logging

from app.core import store
from app.models import AuditLogRow

logger = logging.getLogger("app.audit")


def log_audit_event(
    *,
    user_id: str | None,
    event_type: str,
    method: str,
    path: str,
    status_code: int,
    client_ip: str | None = None,
    detail: str = "",
) -> None:
    try:
        store.put(
            AuditLogRow(
                user_id=user_id,
                event_type=event_type,
                method=method,
                path=path,
                status_code=status_code,
                client_ip=client_ip,
                detail=detail[:500],
            )
        )
    except Exception:  # noqa: BLE001 - audit logging must never break the request
        logger.exception("Failed to write audit log row (event_type=%s path=%s)", event_type, path)


_VERBS = {"POST": "Added", "PUT": "Updated", "PATCH": "Updated", "DELETE": "Deleted"}
_NOUNS = {
    "transactions": "transaction", "budgets": "budget", "goals": "goal", "tax": "tax details", "rules": "rule",
    "household": "household", "plan": "plan", "profile": "profile", "aa": "bank link (Account Aggregator)",
    "security": "security check", "connectors": "connector", "documents": "document", "pay": "payment",
    "expenses": "expense", "upload": "statement", "ocr": "scanned statement", "networth": "net worth",
    "notifications": "notification", "accounts": "account", "simulate": "simulation", "events": "event", "translate": "translation",
}


def humanise_action(event_type: str, method: str, path: str, detail: str = "") -> str:
    """Readable text for an audit row ('Exported data'), so the access log never shows raw 'POST /api/...' strings."""
    if event_type == "rate_limited":
        return "Request blocked: too many requests"
    if event_type == "auth_denied":
        return "Request blocked: not signed in or not allowed"
    if detail and not detail.upper().startswith(("GET ", "POST ", "PUT ", "PATCH ", "DELETE ")):
        return detail
    parts = [p for p in path.split("/") if p]
    last = parts[-1] if parts else ""
    noun = _NOUNS.get(parts[1], "data") if len(parts) > 1 else "data"
    if last == "export":
        return "Exported data"
    if last == "connect":
        return "Connected a data source"
    if last == "sync":
        return "Synced a data source"
    if last == "import":
        return "Imported statement rows"
    if last == "extract":
        return "Read an uploaded statement"
    if last == "investigate":
        return "Ran a wallet security check"
    if last == "snap":
        return "Added an expense from a photo"
    if last == "invites":
        return "Invited a household member"
    verb = _VERBS.get(method.upper(), "Accessed")
    if parts[:2] == ["api", "connectors"] and method.upper() == "DELETE":
        return "Disconnected a data source"
    return f"{verb} {noun}"
