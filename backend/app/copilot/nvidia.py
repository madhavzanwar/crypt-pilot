"""NVIDIA NIM (hosted, OpenAI-compatible) client for the copilot.

The model gets the same pre-fetched, real numbers Nugen gets and must answer with the
AnswerContract JSON. Unlike nugen.py this RAISES on failure so engine.answer can
try the other model.
"""
from __future__ import annotations

import json
import os

import httpx

from app.core.config import get_settings

URL = "https://integrate.api.nvidia.com/v1/chat/completions"


def _timeout(kind: str) -> float:
    """Seconds to wait for NVIDIA. Serverless is capped at 12; elsewhere NVIDIA_DEEP_TIMEOUT_S / NVIDIA_CHAT_TIMEOUT_S (defaults 40 / 30).

    The hosted free endpoints are sometimes slow at peak, and a small shared host adds its own delay, so too short a wait
    turns a slow answer into an error. The deep step is capped below the old 45 s so the fast model still has time to answer."""
    if os.getenv("VERCEL"):
        return 12.0
    name, default = ("NVIDIA_DEEP_TIMEOUT_S", 40.0) if kind == "deep" else ("NVIDIA_CHAT_TIMEOUT_S", 30.0)
    try:
        return max(5.0, float(os.getenv(name, default)))
    except ValueError:
        return default


def complete_json(system: str, user: str) -> dict:
    s = get_settings()
    timeout = _timeout("deep")
    r = httpx.post(
        URL,
        headers={"Authorization": f"Bearer {s.nvidia_api_key}"},
        json={
            "model": s.nvidia_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 3500,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        timeout=timeout,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"NVIDIA {r.status_code}: {r.text[:300]}")
    return json.loads(r.json()["choices"][0]["message"]["content"])


def chat(message: str, history: list[tuple[str, str]], system: str) -> str:
    """Plain conversation on the fast model (no data, no thinking)."""
    s = get_settings()
    timeout = _timeout("chat")
    msgs = [{"role": "system", "content": system}] + [{"role": r, "content": c} for r, c in history[-8:]] + [{"role": "user", "content": message}]
    r = httpx.post(
        URL,
        headers={"Authorization": f"Bearer {s.nvidia_chat_api_key}"},
        json={"model": s.nvidia_chat_model, "messages": msgs, "temperature": 0.7, "max_tokens": 1200, "chat_template_kwargs": {"enable_thinking": False}},
        timeout=timeout,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"NVIDIA {r.status_code}: {r.text[:300]}")
    return (r.json()["choices"][0]["message"]["content"] or "").strip()
