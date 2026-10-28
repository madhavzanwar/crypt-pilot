"""On-demand UI translation (English -> Hindi / Marathi) for text that no one wrote a translation for:
transaction merchants, backend insights, every page's labels. Gemini first, NVIDIA as a fallback, results cached
in memory and on disk so a repeated string is never paid for twice."""
from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from app import telemetry
from app.core.config import get_settings

log = logging.getLogger("finpilot.translate")
LANGS = {"hi": "Hindi", "mr": "Marathi"}
_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
_NVIDIA = "https://integrate.api.nvidia.com/v1/chat/completions"
_FILE = Path(__file__).resolve().parent.parent / ".translation_cache.json"
_CHUNK = 40
_lock = threading.Lock()
_cache: dict[str, dict[str, str]] = {}  # lang -> {english: translated}


def _load() -> None:
    try:
        _cache.update(json.loads(_FILE.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - no file yet, or unreadable: start empty
        pass


def _save() -> None:
    try:
        _FILE.write_text(json.dumps(_cache, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        log.warning("could not save translation cache: %s", exc)


_load()


def _prompt(lang: str, texts: list[str]) -> str:
    return (
        f"Translate each string of this JSON array from English to {LANGS[lang]} for a personal-finance app. "
        "Rules: never convert digits to Devanagari numerals (keep 0-9), keep the rupee sign and any {placeholder} exactly; keep acronyms (EMI, SIP, UPI, APR, GST, ETF, NPS, PPF, SEBI) as they are; "
        "write brand, shop and person names in Devanagari script (Zomato -> झोमॅटो); translate month and weekday names; keep the meaning short and natural. "
        'Reply with JSON only: {"t": [...]} with exactly the same number of items in the same order.\n' + json.dumps(texts, ensure_ascii=False)
    )


def _call(prompt: str) -> list[str] | None:
    s = get_settings()
    if s.gemini_api_key:
        t = telemetry.Timer()
        try:
            r = httpx.post(_GEMINI.format(s.gemini_model), headers={"x-goog-api-key": s.gemini_api_key}, timeout=40,
                           json={"contents": [{"parts": [{"text": prompt}]}],
                                 "generationConfig": {"temperature": 0, "maxOutputTokens": 4096, "responseMimeType": "application/json"}})
            r.raise_for_status()
            out = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])["t"]
            telemetry.record(kind="call", provider="gemini", key="GEMINI_API_KEY", model=s.gemini_model, agent="translate", ok=True, ms=t.ms,
                             tokens=(r.json().get("usageMetadata") or {}).get("totalTokenCount"))
            return out
        except Exception as exc:  # noqa: BLE001 - overloaded or bad key: fall through to NVIDIA
            telemetry.record(kind="call", provider="gemini", key="GEMINI_API_KEY", model=s.gemini_model, agent="translate", ok=False, ms=t.ms, error=type(exc).__name__)
            telemetry.record(kind="fallback", agent="translate", model=s.gemini_model, to=s.nvidia_council_model, reason=type(exc).__name__)
            log.warning("gemini translate failed: %s", exc)
    if s.nvidia_chat_api_key:
        t = telemetry.Timer()
        try:
            r = httpx.post(_NVIDIA, headers={"Authorization": f"Bearer {s.nvidia_chat_api_key}"}, timeout=40,
                           json={"model": s.nvidia_council_model, "messages": [{"role": "user", "content": prompt}], "temperature": 0,
                                 "max_tokens": 4096, "response_format": {"type": "json_object"}, "chat_template_kwargs": {"enable_thinking": False}})
            r.raise_for_status()
            out = json.loads(r.json()["choices"][0]["message"]["content"])["t"]
            telemetry.record(kind="call", provider="nvidia", key="NVIDIA_CHAT_API_KEY", model=s.nvidia_council_model, agent="translate", ok=True, ms=t.ms,
                             tokens=(r.json().get("usage") or {}).get("total_tokens"))
            return out
        except Exception as exc:  # noqa: BLE001
            telemetry.record(kind="call", provider="nvidia", key="NVIDIA_CHAT_API_KEY", model=s.nvidia_council_model, agent="translate", ok=False, ms=t.ms, error=type(exc).__name__)
            log.warning("nvidia translate failed: %s", exc)
    return None


def _chunk(lang: str, texts: list[str]) -> dict[str, str]:
    out = _call(_prompt(lang, texts))
    if isinstance(out, list) and len(out) == len(texts) and all(isinstance(x, str) for x in out):
        return {a: b for a, b in zip(texts, out)}
    if len(texts) > 1:  # a count mismatch usually means the model merged or split items: retry in halves
        mid = len(texts) // 2
        return {**_chunk(lang, texts[:mid]), **_chunk(lang, texts[mid:])}
    return {}


def translate(lang: str, texts: list[str]) -> dict[str, str]:
    """Translations for the texts it could translate; anything missing from the result stays English."""
    if lang not in LANGS:
        return {}
    table = _cache.setdefault(lang, {})
    todo = list(dict.fromkeys(t for t in texts if t not in table))
    if todo:
        chunks = [todo[i:i + _CHUNK] for i in range(0, len(todo), _CHUNK)]
        telemetry.record(kind="split", agent="translate", op=f"to {lang}", parts=len(chunks), detail=f"{len(todo)} new strings, {len(texts) - len(todo)} from cache, {_CHUNK} per call")
        with ThreadPoolExecutor(max_workers=4) as pool:
            fresh = {}
            for part in pool.map(lambda c: _chunk(lang, c), chunks):
                fresh.update(part)
        if fresh:
            with _lock:
                table.update(fresh)
                _save()
    return {t: table[t] for t in texts if t in table}
