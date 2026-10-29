"""Where caches and logs may be written. On serverless hosts (Vercel) the code directory is read-only and only /tmp is
writable; everywhere else the original location next to the code is kept."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path


def _tmp_root() -> Path:
    return Path(tempfile.gettempdir()) / "finpilot"


def writable_dir(preferred: Path) -> Path:
    """`preferred` when it can be created/written (and we are not on Vercel), else the same leaf name under /tmp/finpilot."""
    if not os.getenv("VERCEL"):
        try:
            preferred.mkdir(parents=True, exist_ok=True)
            if os.access(preferred, os.W_OK):
                return preferred
        except OSError:
            pass
    fallback = _tmp_root() / preferred.name
    try:
        fallback.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return fallback


def writable_file(preferred: Path) -> Path:
    """`preferred` when its folder is writable (and we are not on Vercel), else the same file name under /tmp/finpilot.
    If the file only exists in the read-only location it is still read from there by the callers' own fallback."""
    if not os.getenv("VERCEL") and os.access(preferred.parent, os.W_OK):
        return preferred
    fallback = _tmp_root() / preferred.name
    try:
        fallback.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return fallback
