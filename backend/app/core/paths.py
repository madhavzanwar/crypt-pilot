"""Where the app may write caches. On serverless (Vercel) the code directory is read-only and only /tmp is writable."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path


def writable_dir(default: Path) -> Path:
    """`default` normally; a per-app directory under the OS temp dir on Vercel / when FINPILOT_CACHE_DIR points elsewhere."""
    override = os.getenv("FINPILOT_CACHE_DIR")
    if override:
        return Path(override)
    if os.getenv("VERCEL"):
        return Path(tempfile.gettempdir()) / "finpilot"
    return default
