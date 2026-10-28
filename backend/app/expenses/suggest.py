"""Item + price suggestion: the user's own history first, then CLIP zero-shot, then the catalog price."""
from __future__ import annotations

import json
import statistics
from functools import lru_cache

import numpy as np

from app.core import store
from app.expenses import vision
from app.expenses.catalog import ALIASES, BY_KEY, CATALOG, city_factor
from app.models import PriceMemoryRow

MEMORY_MATCH = 0.88  # cosine between photo embeddings that counts as "the same thing as before"
MIN_CONFIDENCE = 0.5  # below this the price is left blank rather than guessed
_RECENT = 5  # how many past prices define "your usual price"


def item_key(name: str) -> str:
    n = " ".join(name.lower().split())
    return ALIASES.get(n, n)


@lru_cache
def _catalog_vectors() -> np.ndarray:
    return vision.embed_texts([f"a photo of {i.prompt}" for i in CATALOG])


def zero_shot(vec: np.ndarray, top: int = 3) -> list[tuple[str, float]]:
    """Best catalog matches with softmax confidences (CLIP logit scale is 100)."""
    logits = 100 * (_catalog_vectors() @ vec)
    p = np.exp(logits - logits.max())
    p /= p.sum()
    order = np.argsort(-p)[:top]
    return [(CATALOG[i].key, float(p[i])) for i in order]


def _usual(rows: list[PriceMemoryRow]) -> tuple[float, float, float]:
    prices = [r.price for r in sorted(rows, key=lambda r: r.created_at, reverse=True)[:_RECENT]]
    return statistics.median(prices), min(prices), max(prices)


def suggest(user_id: str, image: bytes | None, name: str | None, city: str | None) -> dict:
    memory = store.query(PriceMemoryRow, user_id=user_id)
    vec = vision.embed_image(image) if image else None
    item, confidence, alternatives = None, 0.0, []

    if name and name.strip():
        item, confidence = item_key(name), 1.0
    elif vec is not None:
        best, sim = None, 0.0
        for r in memory:
            if r.embedding:
                s = float(np.dot(vec, np.array(json.loads(r.embedding))))
                if s > sim:
                    best, sim = r, s
        if best and sim >= MEMORY_MATCH:
            item, confidence = best.item, sim
        else:
            ranked = zero_shot(vec)
            item, confidence = ranked[0]
            alternatives = [k for k, _ in ranked[1:]]
    if item is None:
        return {"item": None, "category": "other", "price": None, "low": None, "high": None,
                "source": "none", "confidence": 0.0, "alternatives": []}

    known = BY_KEY.get(item)
    category = known.category if known else next((r.category for r in memory if r.item == item), "other")
    mine = [r for r in memory if r.item == item]
    source = "memory"
    if mine:
        price, low, high = _usual(mine)
    elif known and confidence >= MIN_CONFIDENCE:
        f = city_factor(city)
        price, low, high, source = round(known.typical * f), round(known.low * f), round(known.high * f), "estimate"
    else:
        price = low = high = None
        source = "none"
    return {"item": item, "category": category, "price": price, "low": low, "high": high,
            "source": source, "confidence": round(confidence, 3), "alternatives": alternatives}


def remember(user_id: str, item: str, price: float, category: str, image: bytes | None) -> None:
    vec = vision.embed_image(image) if image else None
    store.put(PriceMemoryRow(user_id=user_id, item=item, price=price, category=category,
                             embedding=json.dumps([round(float(x), 5) for x in vec]) if vec is not None else None))
