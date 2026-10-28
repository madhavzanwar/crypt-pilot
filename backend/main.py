"""Vercel entrypoint for FastAPI backend service."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend directory is in sys.path
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.main import app

__all__ = ["app"]
