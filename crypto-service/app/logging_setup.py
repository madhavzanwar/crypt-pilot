"""Structured logging. Full wallet addresses are never logged: use hash_address()."""

from __future__ import annotations

import hashlib
import hmac
import logging
import sys

import structlog

from app.config import get_settings


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        cache_logger_on_first_use=True,
    )


def hash_address(address: str) -> str:
    """Salted, truncated HMAC of an address: stable for correlation, not reversible."""
    salt = get_settings().log_salt.get_secret_value().encode()
    return hmac.new(salt, address.strip().encode(), hashlib.sha256).hexdigest()[:16]


log = structlog.get_logger("cryptiq")
