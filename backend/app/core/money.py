"""Rupee formatting with Indian digit grouping (12,34,567), the way every page of the app shows money."""
from __future__ import annotations


def inr(x: float) -> str:
    """9833 -> ₹9,833, -1490 -> -₹1,490, 1234567 -> ₹12,34,567 (whole rupees; the sign goes before the symbol)."""
    n = int(round(abs(x)))
    head, tail = str(n)[:-3], str(n)[-3:]
    if head:
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        tail = ",".join(parts) + "," + tail
    return f"{'-' if x < 0 and n else ''}₹{tail}"
