"""Hosted vision model (NVIDIA NIM) for photos the local tools cannot read: odd bills, items CLIP is unsure of."""
from __future__ import annotations

import base64
import io
import json
import logging
import re

import httpx
from PIL import Image

from app.core.config import get_settings

log = logging.getLogger("finpilot.vlm")
_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"


def _ask(image: bytes, prompt: str) -> str | None:
    """Gemini when GEMINI_API_KEY is set (falling back to NVIDIA if it fails), else NVIDIA, else None."""
    s = get_settings()
    if not (s.gemini_api_key or s.nvidia_vision_api_key):
        return None
    try:
        img = Image.open(io.BytesIO(image)).convert("RGB")
        img.thumbnail((1280, 1280))  # smaller upload, fewer tokens
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
    except Exception as exc:  # noqa: BLE001
        log.warning("vision model failed: %s", exc)
        return None
    if s.gemini_api_key:
        try:
            r = httpx.post(
                _GEMINI.format(s.gemini_model),
                headers={"x-goog-api-key": s.gemini_api_key},
                timeout=40,
                json={"contents": [{"parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode()}},
                    {"text": prompt}]}],
                    "generationConfig": {"temperature": 0, "maxOutputTokens": 120}},
            )
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as exc:  # noqa: BLE001 - overloaded or bad key: fall through to NVIDIA
            log.warning("gemini failed: %s", exc)
    if not s.nvidia_vision_api_key:
        return None
    try:
        r = httpx.post(
            _URL,
            headers={"Authorization": f"Bearer {s.nvidia_vision_api_key}"},
            timeout=40,
            json={"model": s.nvidia_vision_model, "max_tokens": 120, "temperature": 0,
                  "messages": [{"role": "user", "content": [
                      {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}},
                      {"type": "text", "text": prompt}]}]},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except Exception as exc:  # noqa: BLE001 - the vision model is an extra; never break quick-add
        log.warning("vision model failed: %s", exc)
        return None


def read_bill(image: bytes) -> dict:
    """{'merchant': str|None, 'total': float|None} from a photo of a bill."""
    out = _ask(image, 'This is a photo of a bill or receipt. Reply with JSON only: {"merchant": shop name or null, "total": final amount to pay as a number or null}.')
    try:
        d = json.loads(re.search(r"\{.*\}", out or "", re.S).group(0))
        total = float(str(d.get("total")).replace(",", "")) if d.get("total") not in (None, "null") else None
        return {"merchant": d.get("merchant") or None, "total": total if total and total > 0 else None}
    except (AttributeError, ValueError, TypeError):
        return {"merchant": None, "total": None}


def match_item(image: bytes, names: list[str]) -> str | None:
    """Which of the user's taught items is in this photo? One of `names`, or None."""
    if not names:
        return None
    out = (_ask(image, "The photo shows one everyday item. Which of these is it: " + ", ".join(names) + ". Reply with exactly one name from the list, or NONE if it is not any of them.") or "").strip().strip(".\"'").lower()
    return next((n for n in names if n.lower() == out), None)


def name_item(image: bytes) -> str | None:
    """One or two words naming the main everyday item (e.g. 'cup of tea'), or None."""
    out = (_ask(image, "Name the main everyday item in this photo in one to three words, like 'cup of tea' or 'biscuit packet'. Reply with the name only.") or "").strip().strip(".\"'")
    return out[:40] if out and len(out.split()) <= 4 else None
