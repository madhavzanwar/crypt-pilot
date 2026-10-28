"""Shrink an uploaded document before it is stored and chunked for the model, so fewer tokens are spent on it."""
from __future__ import annotations

import csv
import io
import json
import re


def _csv(text: str) -> str:
    rows = [[re.sub(r"\s+", " ", c).strip() for c in r] for r in csv.reader(io.StringIO(text))]
    rows = [r for r in rows if any(r)]
    keep = [i for i in range(max(map(len, rows), default=0)) if any(i < len(r) and r[i] for r in rows[1:])]  # drop all-empty columns
    return "\n".join("|".join(r[i] if i < len(r) else "" for i in keep) for r in rows)


def compact(name: str, text: str) -> str:
    """CSV: no empty columns/rows, no quoting or padding. JSON: minified. Other text: collapsed whitespace."""
    lower = name.lower()
    try:
        if lower.endswith(".csv"):
            return _csv(text)
        if lower.endswith(".json"):
            return json.dumps(json.loads(text), separators=(",", ":"), ensure_ascii=False)
    except (ValueError, csv.Error):
        pass  # malformed: fall back to plain whitespace cleanup
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()
