"""Tests run against the Firestore emulator.

    firebase emulators:exec --only firestore --project demo-hackmatrix "python -m pytest backend"

Set FIREBASE_PROJECT_ID=demo-<name> to isolate parallel runs from each other.
"""
import os

import httpx
import pytest

os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
_pid = os.getenv("FIREBASE_PROJECT_ID", "")
if not _pid.startswith("demo-"):  # demo-* projects can never reach production
    _pid = "demo-hackmatrix"
os.environ["FIREBASE_PROJECT_ID"] = os.environ["FIRESTORE_PROJECT_ID"] = _pid


def pytest_sessionstart(session):
    # Runs before collection: several test modules seed at import time, so wiping later would delete that data.
    host = os.environ["FIRESTORE_EMULATOR_HOST"]
    try:
        httpx.delete(f"http://{host}/emulator/v1/projects/{_pid}/databases/(default)/documents", timeout=3)
    except httpx.TransportError:
        pytest.exit(
            'Firestore emulator not running: firebase emulators:exec --only firestore '
            '--project demo-hackmatrix "python -m pytest backend"',
            returncode=2,
        )
