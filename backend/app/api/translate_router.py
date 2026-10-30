"""POST /api/translate: English UI text -> Hindi or Marathi (cached)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app import translate
from app.core.guard import require_caller, translate_limiter
from app.core.ratelimit import client_ip

router = APIRouter(prefix="/api/translate", tags=["translate"])


class Req(BaseModel):
    lang: str
    texts: list[str]


@router.post("")
def run(body: Req, request: Request, _: None = Depends(require_caller)) -> dict:
    if body.lang not in translate.LANGS:
        raise HTTPException(400, "lang must be hi or mr")
    if len(body.texts) > 120:
        raise HTTPException(413, "at most 120 texts per request")
    texts = [t for t in body.texts if 0 < len(t) <= 400]  # longer strings are not UI text
    # Only calls that need the model count against the limit: pages already translated (cache hit) cost nothing, so normal
    # browsing in Hindi/Marathi never trips it, while someone sending ever-new strings still does.
    if translate.uncached(body.lang, texts):
        translate_limiter.check(client_ip(request))
    return {"translations": translate.translate(body.lang, texts)}
