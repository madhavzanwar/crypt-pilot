"""Process-wide state built once at startup (engines, model, label lists, DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import httpx

from app.config import Settings
from app.db.base import Database

if TYPE_CHECKING:
    from app.services.pipeline import CheckPipeline


@dataclass
class AppState:
    settings: Settings
    db: Database
    pipeline: CheckPipeline | None = None
    http: httpx.AsyncClient = field(default_factory=lambda: httpx.AsyncClient(timeout=15.0))
    extras: dict[str, Any] = field(default_factory=dict)
