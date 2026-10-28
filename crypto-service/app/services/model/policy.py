"""Verdict policy. Thresholds come from model_card.json (chosen on validation)."""

from __future__ import annotations

from typing import Literal

Verdict = Literal["ALLOW", "WARN", "BLOCK", "UNKNOWN"]


def decide(score: int | None, in_dataset: bool, ofac_hit: bool, warn: int, block: int,
           dataset_label: str | None = None) -> Verdict:
    """OFAC match forces BLOCK (even outside the dataset); otherwise not-in-dataset -> UNKNOWN;
    otherwise ALLOW < warn <= WARN < block <= BLOCK. A wallet the dataset itself labels illicit is
    never ALLOW (floored at WARN), so the verdict cannot contradict the label shown next to it.
    Model-card metrics describe the model alone, without this floor."""
    if ofac_hit:
        return "BLOCK"
    if not in_dataset or score is None:
        return "UNKNOWN"
    if score >= block:
        return "BLOCK"
    if score >= warn or dataset_label == "illicit":
        return "WARN"
    return "ALLOW"
