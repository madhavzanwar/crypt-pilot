"""Read printed text from a photo or scan, on this machine (RapidOCR / ONNX, no cloud). Used for documents and receipts."""
from __future__ import annotations

import io
import re
from functools import lru_cache

import numpy as np
from PIL import Image, UnidentifiedImageError


@lru_cache(maxsize=2)
def _engine(devanagari: bool = False):
    from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR  # imported late: loading the models takes about a second

    if not devanagari:
        return RapidOCR()
    # Hindi / Marathi recognizer (also reads Latin letters and digits); downloaded on first use
    return RapidOCR(params={"Rec.lang_type": LangRec.DEVANAGARI, "Rec.ocr_version": OCRVersion.PPOCRV5, "Rec.model_type": ModelType.MOBILE})

_DEVA_LETTER = re.compile(r"[ऄ-ह]")
_MAX_SIDE = 1600


def _confidence(res) -> float:
    return float(np.mean(res.scores)) if res.scores else 0.0


def warm() -> None:
    """Load the OCR models now so the first upload does not pay for it."""
    _engine(False)(np.zeros((64, 64, 3), dtype=np.uint8))


def read_text(data: bytes) -> str:
    """Text lines in reading order; '' if the bytes are not an image or nothing readable was found."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        return ""
    img.thumbnail((_MAX_SIDE, _MAX_SIDE))  # phone photos are 4000px+; OCR cost grows with pixels and gains nothing past this
    arr = np.array(img)
    # English model first (one pass for the common case). Low confidence means another script: try the Devanagari model
    # (Hindi/Marathi, also reads Latin letters and digits) and keep whichever read the page more confidently.
    res = _engine(False)(arr)
    if _confidence(res) < 0.85:
        alt = _engine(True)(arr)
        if _confidence(alt) > _confidence(res) and len(_DEVA_LETTER.findall("".join(alt.txts or ()))) >= 3:
            res = alt
    if res.txts is None or res.boxes is None:
        return ""
    items = sorted(((float(b[:, 1].mean()), float(b[:, 0].min()), t, float(b[:, 1].max() - b[:, 1].min())) for b, t in zip(res.boxes, res.txts)))
    lines: list[list[tuple[float, str]]] = []
    last_y, last_h = None, 0.0
    for y, x, t, h in items:
        if last_y is not None and abs(y - last_y) < max(last_h, h) * 0.6:  # same printed line
            lines[-1].append((x, t))
        else:
            lines.append([(x, t)])
        last_y, last_h = y, h
    return "\n".join(" ".join(t for _, t in sorted(line)) for line in lines)


_NUM = r"(\d[\d,]*(?:\.\d{1,2})?)"
_TOTAL = re.compile(r"(?:grand\s*total|net\s*(?:amount|payable)|amount\s*(?:due|payable|paid)|total)\D{0,12}" + _NUM, re.I)


def parse_receipt(text: str) -> dict:
    """{'merchant': first text line, 'total': last 'total' amount or None}."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    merchant = next((l for l in lines if re.search(r"[A-Za-zऀ-ൿ]{3}", l) and not re.search(r"\d{4,}", l)), None)
    totals = [float(m.group(1).replace(",", "")) for l in lines if (m := _TOTAL.search(l)) and "sub" not in l.lower()[:4]]
    return {"merchant": merchant, "total": totals[-1] if totals else None}
