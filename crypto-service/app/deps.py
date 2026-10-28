"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.state import AppState


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.cryptiq
    return state


def get_settings_dep(request: Request) -> Settings:
    return get_state(request).settings


def get_session_id(request: Request) -> str:
    """Session id assigned by SessionMiddleware (cookie `cryptiq_sid`)."""
    sid: str = request.state.sid
    return sid
