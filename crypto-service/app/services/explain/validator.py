"""Groundedness validator for generated explanations.

A text passes only if every number it contains appears in the evidence (or is an allowed constant),
label/verdict/list words are backed by the evidence, no banned phrase appears, and the limitation
sentence is present.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.explain.templates import LIMITATION_EN, LIMITATION_HI

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_NUM = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)?(?![\w])")
BANNED = [
    "guilty", "criminal", "scammer", "scam", "fraudster", "thief", "terrorist", "launder", "money laundering",
    "safe wallet", "is safe", "completely safe", "guaranteed", "guarantee", "definitely", "certainly",
    "100% safe", "proven", "legal advice", "you should report", "police", "lawyer", "owned by", "belongs to",
    "दोषी", "अपराधी", "धोखेबाज़", "धोखेबाज", "ठग", "सुरक्षित वॉलेट", "गारंटी", "निश्चित रूप से", "पुलिस", "वकील",
]
_VERDICTS = ("ALLOW", "WARN", "BLOCK", "UNKNOWN")


def _evidence_numbers(ev: Any, out: set[str]) -> None:
    if isinstance(ev, bool) or ev is None:
        return
    if isinstance(ev, int | float):
        out.add(_norm_num(str(ev)))
    elif isinstance(ev, str):
        for m in _NUM.findall(ev):
            out.add(_norm_num(m))
    elif isinstance(ev, dict):
        for v in ev.values():
            _evidence_numbers(v, out)
    elif isinstance(ev, list):
        for v in ev:
            _evidence_numbers(v, out)


def _norm_num(s: str) -> str:
    s = s.replace(",", "")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def validate(text: str, evidence: dict[str, Any], lang: str) -> list[str]:
    """Return a list of problems (empty = grounded)."""
    problems: list[str] = []
    if not text or len(text) > 1200:
        return ["empty or too long"]
    t = text.translate(_DEVANAGARI_DIGITS)
    low = t.lower()
    allowed: set[str] = {"100"} | {str(i) for i in range(int(evidence.get("maxHop", 3)) + 1)}
    _evidence_numbers({k: v for k, v in evidence.items() if k not in ("address",)}, allowed)
    for raw in _NUM.findall(t):
        if _norm_num(raw) not in allowed:
            problems.append(f"ungrounded number {raw}")
    for phrase in BANNED:
        if phrase in low:
            problems.append(f"banned phrase {phrase!r}")
    for v in _VERDICTS:
        if re.search(rf"\b{v}\b", t) and v != evidence.get("verdict"):
            problems.append(f"wrong verdict {v}")
    hits = evidence.get("labelHits", {})
    if ("ofac" in low or "sanction" in low or "प्रतिबंध" in t) and not hits.get("ofac"):
        problems.append("mentions sanctions without an OFAC hit")
    if ("ransom" in low or "रैनसमवेयर" in t) and not hits.get("ransomwhere"):
        problems.append("mentions ransomware without a list hit")
    illicit_backed = evidence.get("datasetLabel") == "illicit" or evidence.get("hopsToNearestIllicit") is not None
    if re.search(r"\billicit\b", low) and not illicit_backed and evidence.get("status") == "ok":
        problems.append("mentions illicit without evidence")
    if evidence.get("status") != "ok":
        marker = "insufficient evidence" if lang == "en" else "पर्याप्त सबूत नहीं"
        if marker not in (low if lang == "en" else t):
            problems.append("missing insufficient-evidence statement")
    limitation = LIMITATION_EN if lang == "en" else LIMITATION_HI
    if limitation.rstrip(".।") not in t:
        problems.append("missing limitation sentence")
    return problems


def ensure_limitation(text: str, lang: str) -> str:
    limitation = LIMITATION_EN if lang == "en" else LIMITATION_HI
    return text if limitation.rstrip(".।") in text else f"{text.rstrip()} {limitation}"
