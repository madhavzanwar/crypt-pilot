"""POST /api/translate: English UI text -> Hindi or Marathi (cached)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import translate

router = APIRouter(prefix="/api/translate", tags=["translate"])


class Req(BaseModel):
    lang: str
    texts: list[str]


@router.post("")
def run(body: Req) -> dict:
    if body.lang not in translate.LANGS:
        raise HTTPException(400, "lang must be hi or mr")
    if len(body.texts) > 120:
        raise HTTPException(413, "at most 120 texts per request")
    texts = [t for t in body.texts if 0 < len(t) <= 400]  # longer strings are not UI text
    return {"translations": translate.translate(body.lang, texts)}
