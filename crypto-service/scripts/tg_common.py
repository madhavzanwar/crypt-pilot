"""Shared helpers for the TigerGraph scripts (admin connection with the same env settings)."""

from __future__ import annotations

from typing import Any

from app.config import get_settings


def connect() -> Any:
    from pyTigerGraph import TigerGraphConnection

    s = get_settings()
    if not s.tg_configured:
        raise SystemExit("Set TG_HOST and TG_SECRET (or TG_USERNAME/TG_PASSWORD) in backend/.env first")
    kwargs: dict[str, Any] = {"host": s.tg_host, "graphname": s.tg_graph}
    if s.tg_username:
        kwargs.update(username=s.tg_username, password=s.tg_password.get_secret_value())
    if s.tg_secret.get_secret_value():
        kwargs["gsqlSecret"] = s.tg_secret.get_secret_value()
    conn = TigerGraphConnection(**kwargs)
    if s.tg_secret.get_secret_value():
        conn.getToken(s.tg_secret.get_secret_value())
    return conn
