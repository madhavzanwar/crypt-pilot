"""LLM explanation with validation, one retry, and per-language template fallback."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from app.errors import UpstreamError
from app.logging_setup import log
from app.services.explain.llm import LLMClient
from app.services.explain.prompts import SYSTEM, user_prompt
from app.services.explain.templates import template_en, template_hi
from app.services.explain.validator import ensure_limitation, validate

_JSON_OBJ = re.compile(r"\{.*\}", re.S)


def parse_pair(text: str) -> tuple[str, str] | None:
    m = _JSON_OBJ.search(text)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    en, hi = data.get("en"), data.get("hi")
    return (en, hi) if isinstance(en, str) and isinstance(hi, str) else None


class LLMExplainer:
    name = "llm"

    def __init__(self, llm: LLMClient, attempts: int = 2, deadline_s: float = 8.0) -> None:
        self.llm = llm
        self.attempts = attempts
        self.deadline_s = deadline_s

    async def explain(self, evidence: dict[str, Any]) -> tuple[str, str]:
        """Overall deadline: a slow or retrying LLM must never hold a live check hostage."""
        try:
            return await asyncio.wait_for(self._explain(evidence), timeout=self.deadline_s)
        except TimeoutError:
            log.warning("explain_deadline", deadline_s=self.deadline_s)
            return template_en(evidence), template_hi(evidence)

    async def _explain(self, evidence: dict[str, Any]) -> tuple[str, str]:
        good: dict[str, str] = {}
        for attempt in range(1, self.attempts + 1):
            try:
                res = await self.llm.complete(SYSTEM, user_prompt(evidence), max_tokens=500)
            except UpstreamError as exc:
                log.warning("explain_llm_error", service=exc.service, detail=exc.detail, attempt=attempt)
                break
            pair = parse_pair(res.text)
            if pair is None:
                log.info("explain_unparseable", attempt=attempt)
                continue
            for lang, text in zip(("en", "hi"), pair, strict=True):
                if lang in good:
                    continue
                text = ensure_limitation(text.strip(), lang)
                problems = validate(text, evidence, lang)
                if problems:
                    log.info("explain_rejected", lang=lang, attempt=attempt, problems=problems[:5])
                else:
                    good[lang] = text
            if len(good) == 2:
                break
        path = {lang: ("llm" if lang in good else "template") for lang in ("en", "hi")}
        log.info("explain_path", **path)
        return good.get("en") or template_en(evidence), good.get("hi") or template_hi(evidence)

    async def aclose(self) -> None:
        await self.llm.aclose()
