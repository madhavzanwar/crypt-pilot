"""Shared HTTP error types."""
from __future__ import annotations

from fastapi import HTTPException


class HintedHTTPException(HTTPException):
    """An HTTPException whose JSON body also carries a `hint` (what the user can do about it); `detail` stays a plain string."""

    def __init__(self, status_code: int, detail: str, *, hint: str) -> None:
        super().__init__(status_code, detail)
        self.hint = hint
